import type { ChatMessage } from './qwenClient.js';

export const SYSTEM_INTERVIEWER = `Sos una entrevistadora profesional en español de Argentina.
Reglas:
- Una pregunta a la vez. No improvises preguntas fuera del listado provisto.
- Si la respuesta es ambigua o muy corta, pedí UNA aclaración (máximo una por pregunta).
- No revelés la rúbrica de evaluación.
- No inventes información sobre el puesto o la empresa.
- Tono cálido pero profesional. Frases breves (apto para voz).`;

export function scoringPrompt(opts: {
  questionText: string;
  rubricText: string;
  candidateResponse: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'Evaluás respuestas de entrevistas. Devolvés exclusivamente un JSON con `score` (entero 1-5) y `justification` (máximo 2 oraciones en español).',
    },
    {
      role: 'user',
      content: `Pregunta: ${opts.questionText}

Rúbrica:
${opts.rubricText}

Respuesta del candidato:
${opts.candidateResponse}

Devolvé JSON: { "score": 1..5, "justification": "..." }`,
    },
  ];
}

export function decisionPrompt(opts: {
  questionText: string;
  candidateResponse: string;
}): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_INTERVIEWER },
    {
      role: 'user',
      content: `Pregunta: ${opts.questionText}
Respuesta: ${opts.candidateResponse}

¿La respuesta es suficiente para puntuar? Si no, ¿qué aclaración pedir (una sola, breve, apta para voz)?
Devolvé JSON: { "sufficient": true|false, "reask": "..." | null }`,
    },
  ];
}

export function summaryPrompt(opts: {
  jobTitle: string;
  transcript: string;
  scores: { question: string; score: number | null; justification: string | null }[];
}): ChatMessage[] {
  const scoresStr = opts.scores
    .map(
      (s, i) =>
        `${i + 1}. ${s.question} → ${s.score ?? 'N/A'} (${s.justification ?? '-'})`,
    )
    .join('\n');

  return [
    {
      role: 'system',
      content:
        'Resumís entrevistas en 3-4 oraciones, en español, foco en fortalezas y debilidades.',
    },
    {
      role: 'user',
      content: `Puesto: ${opts.jobTitle}

Scores:
${scoresStr}

Transcripción:
${opts.transcript}`,
    },
  ];
}
