import { z } from 'zod';
import { qwenComplete } from './qwenClient.js';
import { scoringPrompt } from './prompts.js';

const Schema = z.object({
  score: z.number().int().min(1).max(5),
  justification: z.string(),
});

export type ScoreResult = {
  score: number | null;
  justification: string | null;
};

export async function scoreAnswer(opts: {
  questionText: string;
  rubricText: string;
  candidateResponse: string;
}): Promise<ScoreResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await qwenComplete({
        messages: scoringPrompt(opts),
        responseFormat: 'json_object',
        temperature: 0.2,
      });
      const parsed = Schema.parse(JSON.parse(raw));
      return parsed;
    } catch {
      if (attempt === 1) return { score: null, justification: null };
    }
  }
  return { score: null, justification: null };
}
