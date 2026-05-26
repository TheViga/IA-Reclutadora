import type { ChatMessage } from './qwenClient.js';

export const SYSTEM_INTERVIEWER = `Sos Sofía, una reclutadora profesional en español neutro, cálida y empática.
Reglas:
- Una pregunta a la vez. No improvises preguntas fuera del listado provisto.
- Si la respuesta es ambigua o muy corta, pedí UNA aclaración (máximo una por pregunta).
- No revelés la rúbrica de evaluación.
- No inventes información sobre el puesto o la empresa más allá de lo que te dieron.
- Tono cálido, cercano y profesional. Frases breves y naturales (apto para voz).
- Mostrá modales: saludá, agradecé, reconocé las respuestas del candidato.
- Usá expresiones humanas como "perfecto", "gracias por compartirlo", "qué interesante", "entiendo".`;

export function greetingScript(opts: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  companyDescription: string;
  salaryRange: string;
}): string {
  const company = opts.companyName?.trim()
    ? opts.companyName.trim()
    : 'nuestra empresa';
  const aboutCompany = opts.companyDescription?.trim()
    ? ` Te cuento un poco: ${opts.companyDescription.trim()}`
    : '';
  const salary = opts.salaryRange?.trim()
    ? ` El rango salarial para esta posición es ${opts.salaryRange.trim()}.`
    : '';
  const firstName = opts.candidateName.split(' ')[0] || opts.candidateName;
  return (
    `Hola ${firstName}, ¿cómo estás? Espero que muy bien. ` +
    `Soy Sofía, asistente de reclutamiento de ${company}. ` +
    `Antes que nada, gracias por postularte. Te llamo por la vacante de ${opts.jobTitle}.${aboutCompany}${salary}`
  );
}

export function timeCheckScript(): string {
  return (
    'La entrevista es bastante breve, dura aproximadamente cinco minutos. ' +
    '¿Tenés un momento ahora para conversar, o preferís que te llamemos en otro horario que te quede mejor?'
  );
}

export function goodbyeScript(opts: {
  candidateName: string;
  miniSummary: string;
}): string {
  const firstName =
    opts.candidateName.split(' ')[0] || opts.candidateName;
  return (
    `Listo ${firstName}, esas eran todas las preguntas. ` +
    `${opts.miniSummary} ` +
    `De verdad muchísimas gracias por tu tiempo y por compartir tu experiencia conmigo. ` +
    `Fue un gusto conversar con vos. Vamos a revisar tu perfil con el equipo y te vamos a contactar muy pronto. ` +
    `Te deseo lo mejor. ¡Que tengas un excelente día, ${firstName}!`
  );
}

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

export function availabilityPrompt(opts: {
  candidateResponse: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'Clasificás respuestas sobre disponibilidad horaria. Devolvés JSON exclusivamente.',
    },
    {
      role: 'user',
      content: `El candidato respondió: "${opts.candidateResponse}"

¿Acepta hacer la entrevista ahora? Devolvé JSON:
{ "acceptsNow": true|false, "preferredTime": "texto libre con el horario sugerido o null" }`,
    },
  ];
}

export function miniSummaryPrompt(opts: {
  jobTitle: string;
  qa: { question: string; answer: string | null }[];
}): ChatMessage[] {
  const transcript = opts.qa
    .map(
      (t, i) =>
        `${i + 1}. ${t.question}\n   Respuesta: ${t.answer ?? '(sin respuesta)'}`,
    )
    .join('\n');
  return [
    {
      role: 'system',
      content:
        'Resumís entrevistas en UNA o DOS oraciones cortas, cálidas y agradecidas en español, aptas para decir en voz alta como cierre. Reconocé algo positivo concreto que mencionó el candidato (su experiencia, una respuesta interesante, etc.). No menciones puntuaciones ni evaluaciones. Usá un tono humano y cercano.',
    },
    {
      role: 'user',
      content: `Puesto: ${opts.jobTitle}

Preguntas y respuestas:
${transcript}

Devolvé solo la oración de cierre, sin prefijos.`,
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
