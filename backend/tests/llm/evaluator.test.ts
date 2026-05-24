import { describe, it, expect, vi } from 'vitest';
import * as qwen from '../../src/llm/qwenClient.js';
import { scoreAnswer } from '../../src/llm/evaluator.js';

describe('scoreAnswer', () => {
  it('parsea JSON válido', async () => {
    vi.spyOn(qwen, 'qwenComplete').mockResolvedValue(
      '{"score":4,"justification":"Bien"}',
    );
    const r = await scoreAnswer({
      questionText: 'q',
      rubricText: 'r',
      candidateResponse: 'c',
    });
    expect(r).toEqual({ score: 4, justification: 'Bien' });
  });

  it('devuelve nulls cuando no parsea', async () => {
    vi.spyOn(qwen, 'qwenComplete').mockResolvedValue('no es json');
    const r = await scoreAnswer({
      questionText: 'q',
      rubricText: 'r',
      candidateResponse: 'c',
    });
    expect(r.score).toBeNull();
    expect(r.justification).toBeNull();
  });
});
