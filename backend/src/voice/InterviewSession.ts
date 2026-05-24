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
} from '../llm/prompts.js';
import { logger } from '../lib/logger.js';

type Phase = 'greeting' | 'asking' | 'listening' | 'closing' | 'done';

const SILENCE_DEBOUNCE_MS = 800;

export class InterviewSession {
  private stt!: SttSession;
  private tts!: TtsSession;
  private phase: Phase = 'greeting';
  private currentIdx = 0;
  private reaskedForCurrent = false;
  private questions: { id: string; text: string; rubricText: string }[] = [];
  private currentTurnId: string | null = null;
  private answerBuffer = '';
  private listening = false;
  private debounce: NodeJS.Timeout | null = null;

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
    });
    this.stt.onFinal((text) => this.handleFinalTranscript(text));

    this.socket.onInboundAudio((buf) => {
      if (this.listening) this.stt.send(buf);
    });
    this.socket.onClose(() => this.handleHangup());

    this.tts.speak(
      `Hola ${interview.candidate.fullName}, soy la asistente de reclutamiento. Te voy a hacer ${this.questions.length} preguntas breves sobre la posición de ${interview.job.title}. Empezamos.`,
    );
    this.phase = 'asking';
    await this.askCurrent();
  }

  private async askCurrent() {
    if (this.currentIdx >= this.questions.length) {
      await this.closeOut();
      return;
    }
    const q = this.questions[this.currentIdx];
    const turn = await prisma.interviewTurn.create({
      data: { interviewId: this.interviewId, questionId: q.id },
    });
    this.currentTurnId = turn.id;
    this.reaskedForCurrent = false;
    this.listening = false;
    this.answerBuffer = '';
    this.tts.speak(q.text);
    this.phase = 'listening';
  }

  private handleFinalTranscript(text: string) {
    if (!this.listening || this.phase !== 'listening') return;
    this.answerBuffer += (this.answerBuffer ? ' ' : '') + text;

    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(
      () => this.maybeAdvance(),
      SILENCE_DEBOUNCE_MS,
    );
  }

  private maybeAdvance() {
    if (!this.listening) return;
    const text = this.answerBuffer.trim();
    if (!text) return;
    this.listening = false;
    this.processAnswer(text).catch((err) =>
      logger.error({ err }, 'processAnswer failed'),
    );
  }

  private async processAnswer(text: string) {
    if (!this.currentTurnId) return;
    const q = this.questions[this.currentIdx];

    await prisma.interviewTurn.update({
      where: { id: this.currentTurnId },
      data: { candidateResponseText: text },
    });

    let sufficient = true;
    let reask: string | null = null;
    try {
      const decisionRaw = await qwenComplete({
        messages: decisionPrompt({
          questionText: q.text,
          candidateResponse: text,
        }),
        responseFormat: 'json_object',
        temperature: 0.2,
      });
      const parsed = JSON.parse(decisionRaw);
      sufficient = !!parsed.sufficient;
      reask = parsed.reask ?? null;
    } catch (err) {
      logger.warn({ err }, 'decision parse failed; advancing');
    }

    if (!sufficient && !this.reaskedForCurrent && reask) {
      this.reaskedForCurrent = true;
      this.answerBuffer = '';
      this.tts.speak(reask);
      this.phase = 'listening';
      return;
    }

    const score = await scoreAnswer({
      questionText: q.text,
      rubricText: q.rubricText,
      candidateResponse: text,
    });
    await prisma.interviewTurn.update({
      where: { id: this.currentTurnId },
      data: {
        score: score.score ?? undefined,
        scoreJustification: score.justification ?? undefined,
      },
    });

    this.currentIdx++;
    await this.askCurrent();
  }

  private async closeOut() {
    this.phase = 'closing';
    this.tts.speak(
      'Eso fue todo. Muchas gracias por tu tiempo. Vamos a estar en contacto. ¡Hasta luego!',
    );
    setTimeout(() => {
      this.finalize().catch((err) =>
        logger.error({ err }, 'finalize failed'),
      );
    }, 4000);
  }

  private async finalize() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    await this.computeSummary();
    try {
      this.socket.close();
    } catch {
      /* noop */
    }
    this.stt.close();
    this.tts.close();
  }

  private async computeSummary() {
    const interview = await prisma.interview.findUniqueOrThrow({
      where: { id: this.interviewId },
      include: { job: true, turns: { include: { question: true } } },
    });
    const scored = interview.turns
      .filter((t) => t.score != null)
      .map((t) => t.score!);
    const avg = scored.length
      ? scored.reduce((a, b) => a + b, 0) / scored.length
      : null;
    const transcript = interview.turns
      .map((t) => `Q: ${t.question?.text ?? ''}\nA: ${t.candidateResponseText ?? ''}`)
      .join('\n\n');

    let summary: string | null = null;
    try {
      summary = await qwenComplete({
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
      });
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
  }

  private async handleHangup() {
    if (this.phase === 'done') return;
    const finalStatus = this.phase === 'closing' ? 'completed' : 'failed';
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
