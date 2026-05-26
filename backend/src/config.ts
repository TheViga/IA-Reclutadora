import 'dotenv/config';
import { z } from 'zod';

const Schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  PUBLIC_BASE_URL: z.string().url(),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_FROM_NUMBER: z.string().min(1),
  DEEPGRAM_API_KEY: z.string().min(1),
  QWEN_API_KEY: z.string().min(1),
  QWEN_BASE_URL: z.string().url(),
  QWEN_MODEL: z.string().default('qwen-plus'),
  TTS_VOICE_ID: z.string().default('aura-2-carina-es'),
  STT_LANGUAGE: z.string().default('es'),
  STT_MODEL: z.string().default('nova-2'),
});

export const config = Schema.parse(process.env);
export type Config = z.infer<typeof Schema>;
