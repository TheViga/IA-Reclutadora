import { prisma } from '../db/prisma.js';
import { openSttSession, SttSession } from './deepgramStt.js';
import { openTtsSession, TtsSession } from './deepgramTts.js';
import { TwilioMediaSocket } from './types.js';
import { qwenComplete } from '../llm/qwenClient.js';
import { scoreAnswer } from '../llm/evaluator.js';
import {
  SYSTEM_INTERVIEWER,
  decisionPrompt,
  summaryPrompt,
  greetingScript,
  timeCheckScript,
  goodbyeScript,
  availabilityPrompt,
  miniSummaryPrompt,
} from '../llm/prompts.js';
import { logger } from '../lib/logger.js';

type Phase =
  | 'intro'
  | 'timeCheck'
  | 'asking'
  | 'listening'
  | 'closing'
  | 'done';

const SILENCE_DEBOUNCE_MS = 1000;
const NO_RESPONSE_TIMEOUT_MS = 12_000;
const LLM_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), ms),
    ),
  ]);
}

export class InterviewSession {
  private stt!: SttSession;
  private tts!: TtsSession;
  private phase: Phase = 'intro';
  private currentIdx = 0;
  private reaskedForCurrent = false;
  private questions: { id: string; text: string; rubricText: string }[] = [];
  private currentTurnId: string | null = null;
  private answerBuffer = '';
  private listening = false;
  private debounce: NodeJS.Timeout | null = null;
  private noResponseTimer: NodeJS.Timeout | null = null;
  private candidateName = '';
  private jobTitle = '';
  private companyName = '';
  private timeCheckBuffer = '';
  private timeCheckReasked = false;

  constructor(
    private interviewId: string,
    private socket: TwilioMediaSocket,
  ) {}

  async start() {
    const interview = await prisma.interview.findUniqueOrThrow({
      where: { id: this.interviewId },
      include: {
        job: { include: { questions: { orderBy: { order: 'asc' } } } },
        candidate: true,
      },
    });
    this.questions = interview.job.questions.map((q) => ({
      id: q.id,
      text: q.text,
      rubricText: q.rubricText,
    }));
    this.candidateName = interview.candidate.fullName;
    this.jobTitle = interview.job.title;
    this.companyName = interview.job.companyName || '';

    await prisma.interview.update({
      where: { id: this.interviewId },
      data: { status: 'in_progress', startedAt: new Date() },
    });

    this.stt = openSttSession();
    this.tts = openTtsSession();

    this.tts.onAudio((buf) => this.socket.sendOutboundAudio(buf));
    this.tts.onFlushed(() => {
      this.socket.sendMark('flushed');
      this.listening = true;
      this.answerBuffer = '';
      this.timeCheckBuffer = '';
      this.armNoResponseTimer();
    });
    this.stt.onFinal((text) => this.handleFinalTranscript(text));

    this.socket.onInboundAudio((buf) => {
      if (this.listening) this.stt.send(buf);
    });
    this.socket.onClose(() => this.handleHangup());

    // PHASE 1: Greeting + company intro
    this.phase = 'intro';
    this.tts.speak(
      greetingScript({
        candidateName: this.candidateName,
        jobTitle: this.jobTitle,
        companyName: this.companyName,
        companyDescription: interview.job.companyDescription || '',
        salaryRange: interview.job.salaryRange || '',
      }),
    );

    // PHASE 2: Time check question
    this.phase = 'timeCheck';
    this.tts.speak(timeCheckScript());
  }

  private armNoResponseTimer() {
    if (this.noResponseTimer) clearTimeout(this.noResponseTimer);
    this.noResponseTimer = setTimeout(
      () => this.handleNoResponse(),
      NO_RESPONSE_TIMEOUT_MS,
    );
  }

  private clearNoResponseTimer() {
    if (this.noResponseTimer) {
      clearTimeout(this.noResponseTimer);
      this.noResponseTimer = null;
    }
  }

  private handleNoResponse() {
    if (!this.listening) return;
    if (this.phase === 'listening' && !this.reaskedForCurrent) {
      this.reaskedForCurrent = true;
      this.listening = false;
      this.tts.speak('Disculpá, ¿podés repetir tu respuesta?');
      return;
    }
    if (this.phase === 'timeCheck' && !this.timeCheckReasked) {
      this.timeCheckReasked = true;
      this.listening = false;
      this.tts.speak(
        '¿Estás ahí? Si tenés tiempo ahora, decí sí; si no, decime cuándo prefiriéndolo.',
      );
      return;
    }
    // give up
    this.endWithoutInterview('No hubo respuesta. Hasta luego.');
  }

  private handleFinalTranscript(text: string) {
    if (!this.listening) return;

    if (this.phase === 'timeCheck') {
      this.timeCheckBuffer += (this.timeCheckBuffer ? ' ' : '') + text;
      if (this.debounce) clearTimeout(this.debounce);
      this.debounce = setTimeout(
        () => this.processTimeCheck(),
        SILENCE_DEBOUNCE_MS,
      );
      return;
    }

    if (this.phase !== 'listening') return;
    this.answerBuffer += (this.answerBuffer ? ' ' : '') + text;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(
      () => this.maybeAdvance(),
      SILENCE_DEBOUNCE_MS,
    );
  }

  private async processTimeCheck() {
    if (!this.listening || this.phase !== 'timeCheck') return;
    const reply = this.timeCheckBuffer.trim();
    if (!reply) return;
    this.listening = false;
    this.clearNoResponseTimer();

    let acceptsNow = true;
    let preferredTime: string | null = null;
    try {
      const raw = await withTimeout(
        qwenComplete({
          messages: availabilityPrompt({ candidateResponse: reply }),
          responseFormat: 'json_object',
          temperature: 0.1,
        }),
        LLM_TIMEOUT_MS,
        'availability',
      );
      const parsed = JSON.parse(raw);
      acceptsNow = parsed.acceptsNow !== false;
      preferredTime = parsed.preferredTime ?? null;
    } catch (err) {
      logger.warn({ err }, 'availability classify failed, assuming yes');
    }

    // log the time-check answer
    try {
      await prisma.interviewTurn.create({
        data: {
          interviewId: this.interviewId,
          candidateResponseText: `[disponibilidad] ${reply}`,
        },
      });
    } catch (err) {
      logger.warn({ err }, 'failed to log time check turn');
    }

    if (!acceptsNow) {
      const when = preferredTime
        ? ` Te llamamos ${preferredTime}.`
        : ' Te llamamos en otro momento.';
      this.endWithoutInterview(
        `Perfecto, gracias por avisarme.${when} ¡Que tengas un buen día!`,
      );
      return;
    }

    // proceed with questions
    this.phase = 'asking';
    this.tts.speak(
      `Genial, gracias. Te voy a hacer ${this.questions.length} preguntas breves. Empezamos.`,
    );
    await this.askCurrent();
  }

  private async askCurrent() {
    if (this.currentIdx >= this.questions.length) {
      await this.closeOut();
      return;
    }
    const q = this.questions[this.currentIdx];
    try {
      const turn = await prisma.interviewTurn.create({
        data: { interviewId: this.interviewId, questionId: q.id },
      });
      this.currentTurnId = turn.id;
    } catch (err) {
      logger.error({ err }, 'failed to create turn, skipping question');
      this.currentIdx++;
      await this.askCurrent();
      return;
    }
    this.reaskedForCurrent = false;
    this.listening = false;
    this.answerBuffer = '';
    this.phase = 'listening';
    this.tts.speak(q.text);
  }

  private maybeAdvance() {
    if (!this.listening) return;
    const text = this.answerBuffer.trim();
    if (!text) return;
    this.listening = false;
    this.clearNoResponseTimer();
    this.processAnswer(text).catch((err) => {
      logger.error({ err }, 'processAnswer failed, advancing anyway');
      this.currentIdx++;
      this.askCurrent().catch((e) =>
        logger.error({ err: e }, 'askCurrent failed after processAnswer error'),
      );
    });
  }

  private async processAnswer(text: string) {
    if (!this.currentTurnId) {
      this.currentIdx++;
      await this.askCurrent();
      return;
    }
    const q = this.questions[this.currentIdx];
    const turnId = this.currentTurnId;

    try {
      await prisma.interviewTurn.update({
        where: { id: turnId },
        data: { candidateResponseText: text },
      });
    } catch (err) {
      logger.warn({ err }, 'failed to save response text');
    }

    let sufficient = true;
    let reask: string | null = null;
    try {
      const decisionRaw = await withTimeout(
        qwenComplete({
          messages: decisionPrompt({
            questionText: q.text,
            candidateResponse: text,
          }),
          responseFormat: 'json_object',
          temperature: 0.2,
        }),
        LLM_TIMEOUT_MS,
        'decision',
      );
      const parsed = JSON.parse(decisionRaw);
      sufficient = !!parsed.sufficient;
      reask = parsed.reask ?? null;
    } catch (err) {
      logger.warn({ err }, 'decision parse failed; advancing');
    }

    if (!sufficient && !this.reaskedForCurrent && reask) {
      this.reaskedForCurrent = true;
      this.answerBuffer = '';
      this.phase = 'listening';
      this.tts.speak(reask);
      return;
    }

    // score asynchronously - don't block advancement on scoring failure
    try {
      const score = await withTimeout(
        scoreAnswer({
          questionText: q.text,
          rubricText: q.rubricText,
          candidateResponse: text,
        }),
        LLM_TIMEOUT_MS,
        'score',
      );
      await prisma.interviewTurn.update({
        where: { id: turnId },
        data: {
          score: score.score ?? undefined,
          scoreJustification: score.justification ?? undefined,
        },
      });
    } catch (err) {
      logger.warn({ err }, 'scoring failed; advancing without score');
    }

    this.currentIdx++;
    await this.askCurrent();
  }

  private async closeOut() {
    this.phase = 'closing';
    this.clearNoResponseTimer();

    // build mini summary from turns
    let miniSummary = 'Tus respuestas quedaron registradas para revisión.';
    try {
      const turns = await prisma.interviewTurn.findMany({
        where: {
          interviewId: this.interviewId,
          questionId: { not: null },
        },
        include: { question: true },
        orderBy: { askedAt: 'asc' },
      });
      const qa = turns.map((t) => ({
        question: t.question?.text ?? '',
        answer: t.candidateResponseText,
      }));
      const raw = await withTimeout(
        qwenComplete({
          messages: miniSummaryPrompt({ jobTitle: this.jobTitle, qa }),
          temperature: 0.3,
        }),
        LLM_TIMEOUT_MS,
        'miniSummary',
      );
      if (raw && raw.trim()) miniSummary = raw.trim().replace(/\s+/g, ' ');
    } catch (err) {
      logger.warn({ err }, 'mini summary generation failed');
    }

    this.tts.speak(
      goodbyeScript({
        candidateName: this.candidateName,
        miniSummary,
      }),
    );

    setTimeout(() => {
      this.finalize().catch((err) =>
        logger.error({ err }, 'finalize failed'),
      );
    }, 8000);
  }

  private endWithoutInterview(message: string) {
    this.phase = 'closing';
    this.clearNoResponseTimer();
    this.tts.speak(message);
    setTimeout(() => {
      this.finalize().catch((err) =>
        logger.error({ err }, 'finalize failed'),
      );
    }, 5000);
  }

  private async finalize() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.clearNoResponseTimer();
    await this.computeSummary();
    try {
      this.socket.close();
    } catch {
      /* noop */
    }
    this.stt?.close();
    this.tts?.close();
  }

  private async computeSummary() {
    try {
      const interview = await prisma.interview.findUniqueOrThrow({
        where: { id: this.interviewId },
        include: { job: true, turns: { include: { question: true } } },
      });
      const scoredTurns = interview.turns.filter((t) => t.score != null);
      const scored = scoredTurns.map((t) => t.score!);
      const avg = scored.length
        ? scored.reduce((a, b) => a + b, 0) / scored.length
        : null;
      const transcript = interview.turns
        .map(
          (t) =>
            `Q: ${t.question?.text ?? '(intro)'}\nA: ${t.candidateResponseText ?? ''}`,
        )
        .join('\n\n');

      let summary: string | null = null;
      try {
        summary = await withTimeout(
          qwenComplete({
            messages: summaryPrompt({
              jobTitle: interview.job.title,
              transcript,
              scores: interview.turns.map((t) => ({
                question: t.question?.text ?? '',
                score: t.score,
                justification: t.scoreJustification,
              })),
            }),
            temperature: 0.4,
          }),
          LLM_TIMEOUT_MS * 2,
          'summary',
        );
      } catch (err) {
        logger.warn({ err }, 'summary generation failed');
      }

      await prisma.interview.update({
        where: { id: this.interviewId },
        data: {
          status: 'completed',
          endedAt: new Date(),
          overallScore: avg,
          summary,
        },
      });
    } catch (err) {
      logger.error({ err }, 'computeSummary failed');
    }
  }

  private async handleHangup() {
    if (this.phase === 'done') return;
    this.clearNoResponseTimer();
    const finalStatus =
      this.phase === 'closing' || this.phase === 'done' ? 'completed' : 'failed';
    try {
      await prisma.interview.update({
        where: { id: this.interviewId },
        data: { status: finalStatus, endedAt: new Date() },
      });
    } catch (err) {
      logger.error({ err }, 'failed to update interview on hangup');
    }
    this.stt?.close();
    this.tts?.close();
    this.phase = 'done';
  }
}

// expose constant for testing/tuning
export const _internals = { SYSTEM_INTERVIEWER };
