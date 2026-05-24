import { request } from 'undici';
import { config } from '../config.js';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface QwenCompleteOpts {
  messages: ChatMessage[];
  temperature?: number;
  responseFormat?: 'text' | 'json_object';
  maxTokens?: number;
}

export async function qwenComplete(opts: QwenCompleteOpts): Promise<string> {
  const body = {
    model: config.QWEN_MODEL,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 512,
    ...(opts.responseFormat === 'json_object'
      ? { response_format: { type: 'json_object' } }
      : {}),
  };

  const res = await request(`${config.QWEN_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.QWEN_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (res.statusCode >= 400) {
    const text = await res.body.text();
    throw new Error(`Qwen error ${res.statusCode}: ${text}`);
  }

  const json = (await res.body.json()) as {
    choices: { message: { content: string } }[];
  };
  return json.choices[0].message.content;
}
