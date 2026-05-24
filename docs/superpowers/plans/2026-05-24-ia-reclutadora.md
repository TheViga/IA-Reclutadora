# IA Reclutadora Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema que llama por Twilio a candidatos, los entrevista con Qwen3 + Deepgram STT/TTS y guarda transcripción + score 1-5 por pregunta en Postgres, gestionado desde un panel React.

**Architecture:** Monolito Node.js/TypeScript (Fastify) con REST + WebSocket `/media` para Twilio Media Streams. Por cada llamada se crea una `InterviewSession` que orquesta STT (Deepgram WS) ↔ LLM (Qwen3 HTTPS) ↔ TTS (Aura WS). Frontend React separado consume la REST.

**Tech Stack:** Node 20, TypeScript, Fastify, @fastify/websocket, Prisma, PostgreSQL, Zod, pino, twilio SDK, @deepgram/sdk, ws, undici, Vite, React 18, TanStack Query.

---

## Phase 0 — Setup del repo

### Task 0.1: Estructura base y workspace

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.editorconfig`, `tsconfig.base.json`, `docker-compose.yml`, `.env.example`, `README.md`

- [ ] Crear `pnpm-workspace.yaml`:
```yaml
packages:
  - backend
  - frontend
```

- [ ] Crear `.gitignore`:
```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
```

- [ ] Crear `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] Crear `docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ia
      POSTGRES_PASSWORD: ia
      POSTGRES_DB: ia_reclutadora
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] Crear `.env.example`:
```
DATABASE_URL=postgresql://ia:ia@localhost:5432/ia_reclutadora
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
DEEPGRAM_API_KEY=
QWEN_API_KEY=
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
TTS_VOICE_ID=aura-2-celeste-es
STT_LANGUAGE=es
STT_MODEL=nova-2
```

- [ ] Commit: `chore: workspace scaffolding`

---

## Phase 1 — Backend bootstrap

### Task 1.1: package.json y deps backend

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`

- [ ] `backend/package.json`:
```json
{
  "name": "backend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@deepgram/sdk": "^3.9.0",
    "@fastify/cors": "^9.0.1",
    "@fastify/websocket": "^10.0.1",
    "@prisma/client": "^5.20.0",
    "dotenv": "^16.4.5",
    "fastify": "^4.28.1",
    "pino": "^9.4.0",
    "pino-pretty": "^11.2.2",
    "twilio": "^5.3.0",
    "undici": "^6.20.0",
    "ws": "^8.18.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.16.0",
    "@types/ws": "^8.5.12",
    "prisma": "^5.20.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] `backend/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] Commit: `chore(backend): package and tsconfig`

### Task 1.2: Config (env validation)

**Files:**
- Create: `backend/src/config.ts`

- [ ] Implementar `config.ts`:
```ts
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
  TTS_VOICE_ID: z.string().default('aura-2-celeste-es'),
  STT_LANGUAGE: z.string().default('es'),
  STT_MODEL: z.string().default('nova-2'),
});

export const config = Schema.parse(process.env);
export type Config = z.infer<typeof Schema>;
```

- [ ] Commit: `feat(backend): typed config`

### Task 1.3: Logger

**Files:**
- Create: `backend/src/lib/logger.ts`

- [ ] Implementar:
```ts
import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true } },
});
```

- [ ] Commit: `feat(backend): logger`

### Task 1.4: Server bootstrap

**Files:**
- Create: `backend/src/server.ts`

- [ ] Implementar:
```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { logger } from './lib/logger.js';

async function main() {
  const app = Fastify({ loggerInstance: logger });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.get('/health', async () => ({ ok: true }));

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  logger.info(`listening on ${config.PORT}`);
}

main().catch((err) => { logger.error(err); process.exit(1); });
```

- [ ] Test manual: `pnpm dev` → `curl localhost:3000/health` → `{"ok":true}`.
- [ ] Commit: `feat(backend): fastify server with health`

---

## Phase 2 — Database (Prisma)

### Task 2.1: Schema Prisma

**Files:**
- Create: `backend/prisma/schema.prisma`

- [ ] Schema:
```prisma
generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Job {
  id          String     @id @default(cuid())
  title       String
  description String
  language    String     @default("es")
  voiceId     String?
  createdAt   DateTime   @default(now())
  questions   Question[]
  interviews  Interview[]
}

model Question {
  id         String   @id @default(cuid())
  jobId      String
  job        Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  order      Int
  text       String
  rubricText String
  maxScore   Int      @default(5)
  turns      InterviewTurn[]
  @@unique([jobId, order])
}

model Candidate {
  id         String   @id @default(cuid())
  fullName   String
  phoneE164  String
  email      String?
  notes      String?
  createdAt  DateTime @default(now())
  interviews Interview[]
}

enum InterviewStatus {
  scheduled
  dialing
  in_progress
  completed
  failed
  no_answer
}

model Interview {
  id            String           @id @default(cuid())
  jobId         String
  job           Job              @relation(fields: [jobId], references: [id])
  candidateId   String
  candidate     Candidate        @relation(fields: [candidateId], references: [id])
  status        InterviewStatus  @default(scheduled)
  scheduledAt   DateTime
  startedAt     DateTime?
  endedAt       DateTime?
  twilioCallSid String?
  recordingUrl  String?
  overallScore  Float?
  summary       String?
  createdAt     DateTime         @default(now())
  turns         InterviewTurn[]
  events        CallEvent[]
}

model InterviewTurn {
  id                    String     @id @default(cuid())
  interviewId           String
  interview             Interview  @relation(fields: [interviewId], references: [id], onDelete: Cascade)
  questionId            String?
  question              Question?  @relation(fields: [questionId], references: [id])
  askedAt               DateTime   @default(now())
  candidateResponseText String?
  responseAudioUrl      String?
  score                 Int?
  scoreJustification    String?
}

model CallEvent {
  id          String     @id @default(cuid())
  interviewId String
  interview   Interview  @relation(fields: [interviewId], references: [id], onDelete: Cascade)
  ts          DateTime   @default(now())
  kind        String
  payload     Json?
}
```

- [ ] Run: `docker-compose up -d`
- [ ] Run: `cd backend && pnpm prisma migrate dev --name init`
- [ ] Commit: `feat(db): initial schema + migration`

### Task 2.2: Prisma client singleton

**Files:**
- Create: `backend/src/db/prisma.ts`

- [ ] Implementar:
```ts
import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
```

- [ ] Commit: `feat(db): prisma client`

---

## Phase 3 — REST API (CRUD)

### Task 3.1: Jobs routes

**Files:**
- Create: `backend/src/http/jobs.routes.ts`

- [ ] Implementar `POST /jobs`, `GET /jobs`, `GET /jobs/:id` (con questions), `PATCH /jobs/:id`, `DELETE /jobs/:id`. Validar body con Zod.

```ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';

const Create = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  voiceId: z.string().optional(),
});

export async function jobsRoutes(app: FastifyInstance) {
  app.post('/jobs', async (req) => {
    const body = Create.parse(req.body);
    return prisma.job.create({ data: body });
  });
  app.get('/jobs', async () => prisma.job.findMany({ orderBy: { createdAt: 'desc' } }));
  app.get('/jobs/:id', async (req) => {
    const { id } = req.params as { id: string };
    return prisma.job.findUniqueOrThrow({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
  });
  app.patch('/jobs/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = Create.partial().parse(req.body);
    return prisma.job.update({ where: { id }, data: body });
  });
  app.delete('/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.job.delete({ where: { id } });
    reply.code(204);
  });
}
```

- [ ] Registrar en `server.ts`: `await app.register(jobsRoutes);`
- [ ] Test manual: crear un job con curl, verificar GET.
- [ ] Commit: `feat(api): jobs CRUD`

### Task 3.2: Questions routes

**Files:**
- Create: `backend/src/http/questions.routes.ts`

- [ ] Implementar:
```ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';

const Create = z.object({
  text: z.string().min(1),
  rubricText: z.string().min(1),
  order: z.number().int().nonnegative(),
});

export async function questionsRoutes(app: FastifyInstance) {
  app.post('/jobs/:jobId/questions', async (req) => {
    const { jobId } = req.params as { jobId: string };
    const body = Create.parse(req.body);
    return prisma.question.create({ data: { ...body, jobId } });
  });
  app.patch('/questions/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = Create.partial().parse(req.body);
    return prisma.question.update({ where: { id }, data: body });
  });
  app.delete('/questions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.question.delete({ where: { id } });
    reply.code(204);
  });
}
```

- [ ] Registrar y commitear.

### Task 3.3: Candidates routes

**Files:**
- Create: `backend/src/http/candidates.routes.ts`

- [ ] CRUD análogo (POST/GET/GET-by-id/PATCH/DELETE). Validar `phoneE164` con regex `/^\+\d{8,15}$/`.
- [ ] Commit.

### Task 3.4: Interviews routes

**Files:**
- Create: `backend/src/http/interviews.routes.ts`

- [ ] Implementar:
  - `POST /interviews` → `{ jobId, candidateId, scheduledAt }`
  - `GET /interviews?status=&jobId=`
  - `GET /interviews/:id` → include `turns: { include: { question: true } }` + job + candidate
  - `POST /interviews/:id/cancel` → si `status ∈ {scheduled}` setear `failed`

```ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';

const Create = z.object({
  jobId: z.string(),
  candidateId: z.string(),
  scheduledAt: z.coerce.date(),
});

export async function interviewsRoutes(app: FastifyInstance) {
  app.post('/interviews', async (req) => {
    const body = Create.parse(req.body);
    return prisma.interview.create({ data: { ...body, status: 'scheduled' } });
  });
  app.get('/interviews', async (req) => {
    const q = req.query as { status?: string; jobId?: string };
    return prisma.interview.findMany({
      where: { status: q.status as any, jobId: q.jobId },
      include: { job: true, candidate: true },
      orderBy: { scheduledAt: 'desc' },
    });
  });
  app.get('/interviews/:id', async (req) => {
    const { id } = req.params as { id: string };
    return prisma.interview.findUniqueOrThrow({
      where: { id },
      include: {
        job: true,
        candidate: true,
        turns: { include: { question: true }, orderBy: { askedAt: 'asc' } },
      },
    });
  });
  app.post('/interviews/:id/cancel', async (req) => {
    const { id } = req.params as { id: string };
    return prisma.interview.update({ where: { id }, data: { status: 'failed' } });
  });
}
```

- [ ] Commit.

---

## Phase 4 — Cliente Qwen y evaluador

### Task 4.1: Cliente Qwen

**Files:**
- Create: `backend/src/llm/qwenClient.ts`

- [ ] Implementar wrapper sobre OpenAI-compatible API:
```ts
import { request } from 'undici';
import { config } from '../config.js';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

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
    throw new Error(`Qwen error ${res.statusCode}: ${await res.body.text()}`);
  }
  const json = (await res.body.json()) as any;
  return json.choices[0].message.content as string;
}
```

- [ ] Commit.

### Task 4.2: Prompts

**Files:**
- Create: `backend/src/llm/prompts.ts`

- [ ] Implementar:
```ts
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
}) {
  return [
    {
      role: 'system' as const,
      content:
        'Evaluás respuestas de entrevistas. Devolvés exclusivamente un JSON con `score` (entero 1-5) y `justification` (máximo 2 oraciones en español).',
    },
    {
      role: 'user' as const,
      content: `Pregunta: ${opts.questionText}\n\nRúbrica:\n${opts.rubricText}\n\nRespuesta del candidato:\n${opts.candidateResponse}\n\nDevolvé JSON: { "score": 1..5, "justification": "..." }`,
    },
  ];
}

export function summaryPrompt(opts: {
  jobTitle: string;
  transcript: string;
  scores: { question: string; score: number | null; justification: string | null }[];
}) {
  const scoresStr = opts.scores
    .map((s, i) => `${i + 1}. ${s.question} → ${s.score ?? 'N/A'} (${s.justification ?? '-'})`)
    .join('\n');
  return [
    { role: 'system' as const, content: 'Resumís entrevistas en 3-4 oraciones, en español, foco en fortalezas y debilidades.' },
    {
      role: 'user' as const,
      content: `Puesto: ${opts.jobTitle}\n\nScores:\n${scoresStr}\n\nTranscripción:\n${opts.transcript}`,
    },
  ];
}
```

- [ ] Commit.

### Task 4.3: Evaluator con tests

**Files:**
- Create: `backend/src/llm/evaluator.ts`, `backend/tests/llm/evaluator.test.ts`

- [ ] Test primero:
```ts
import { describe, it, expect, vi } from 'vitest';
import * as qwen from '../../src/llm/qwenClient.js';
import { scoreAnswer } from '../../src/llm/evaluator.js';

describe('scoreAnswer', () => {
  it('parsea JSON válido', async () => {
    vi.spyOn(qwen, 'qwenComplete').mockResolvedValue('{"score":4,"justification":"Bien"}');
    const r = await scoreAnswer({ questionText: 'q', rubricText: 'r', candidateResponse: 'c' });
    expect(r).toEqual({ score: 4, justification: 'Bien' });
  });
  it('reintenta una vez si parsea mal y luego devuelve null', async () => {
    vi.spyOn(qwen, 'qwenComplete').mockResolvedValue('no es json');
    const r = await scoreAnswer({ questionText: 'q', rubricText: 'r', candidateResponse: 'c' });
    expect(r.score).toBeNull();
  });
});
```

- [ ] Implementar:
```ts
import { z } from 'zod';
import { qwenComplete } from './qwenClient.js';
import { scoringPrompt } from './prompts.js';

const Schema = z.object({ score: z.number().int().min(1).max(5), justification: z.string() });
export type ScoreResult = { score: number | null; justification: string | null };

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
```

- [ ] Run: `pnpm test` → pasa.
- [ ] Commit.

---

## Phase 5 — Cliente Deepgram (STT y TTS)

### Task 5.1: Twilio framing (μ-law)

**Files:**
- Create: `backend/src/voice/twilioFraming.ts`, `backend/tests/voice/twilioFraming.test.ts`

- [ ] Tests:
```ts
import { describe, it, expect } from 'vitest';
import { decodeInboundMedia, encodeOutboundMedia } from '../../src/voice/twilioFraming.js';

describe('twilioFraming', () => {
  it('decode pasa el payload μ-law como Buffer', () => {
    const ev = { event: 'media', media: { payload: Buffer.from('hello').toString('base64') } };
    const buf = decodeInboundMedia(ev as any);
    expect(buf?.toString()).toBe('hello');
  });
  it('encode arma frame para Twilio', () => {
    const frame = encodeOutboundMedia('SID', Buffer.from([1, 2, 3]));
    expect(frame.event).toBe('media');
    expect(frame.streamSid).toBe('SID');
    expect(Buffer.from(frame.media.payload, 'base64')).toEqual(Buffer.from([1, 2, 3]));
  });
});
```

- [ ] Implementar:
```ts
export type TwilioInboundMessage =
  | { event: 'connected' }
  | { event: 'start'; start: { streamSid: string; callSid: string } }
  | { event: 'media'; media: { payload: string } }
  | { event: 'mark'; mark: { name: string } }
  | { event: 'stop' };

export function decodeInboundMedia(msg: TwilioInboundMessage): Buffer | null {
  if (msg.event !== 'media') return null;
  return Buffer.from(msg.media.payload, 'base64');
}

export function encodeOutboundMedia(streamSid: string, mulaw: Buffer) {
  return {
    event: 'media',
    streamSid,
    media: { payload: mulaw.toString('base64') },
  };
}

export function encodeMark(streamSid: string, name: string) {
  return { event: 'mark', streamSid, mark: { name } };
}
```

- [ ] Commit.

### Task 5.2: Deepgram STT WS

**Files:**
- Create: `backend/src/voice/deepgramStt.ts`

- [ ] Implementar wrapper sobre WebSocket nativo (no SDK para tener control):
```ts
import WebSocket from 'ws';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export interface SttSession {
  send(mulaw: Buffer): void;
  finalize(): void;
  close(): void;
  onPartial(cb: (text: string) => void): void;
  onFinal(cb: (text: string) => void): void;
}

export function openSttSession(): SttSession {
  const url = new URL('wss://api.deepgram.com/v1/listen');
  url.searchParams.set('encoding', 'mulaw');
  url.searchParams.set('sample_rate', '8000');
  url.searchParams.set('language', config.STT_LANGUAGE);
  url.searchParams.set('model', config.STT_MODEL);
  url.searchParams.set('interim_results', 'true');
  url.searchParams.set('endpointing', '300');
  url.searchParams.set('smart_format', 'true');

  const ws = new WebSocket(url.toString(), {
    headers: { Authorization: `Token ${config.DEEPGRAM_API_KEY}` },
  });

  let onPartial: (t: string) => void = () => {};
  let onFinal: (t: string) => void = () => {};
  const queue: Buffer[] = [];
  let open = false;

  ws.on('open', () => {
    open = true;
    for (const b of queue) ws.send(b);
    queue.length = 0;
  });
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const alt = msg.channel?.alternatives?.[0];
      if (!alt?.transcript) return;
      if (msg.is_final) onFinal(alt.transcript);
      else onPartial(alt.transcript);
    } catch (err) {
      logger.warn({ err }, 'stt parse');
    }
  });
  ws.on('error', (err) => logger.error({ err }, 'stt ws'));

  return {
    send(buf) {
      if (open) ws.send(buf);
      else queue.push(buf);
    },
    finalize() {
      if (open) ws.send(JSON.stringify({ type: 'Finalize' }));
    },
    close() {
      try { ws.close(); } catch {}
    },
    onPartial(cb) { onPartial = cb; },
    onFinal(cb) { onFinal = cb; },
  };
}
```

- [ ] Commit.

### Task 5.3: Deepgram Aura TTS WS

**Files:**
- Create: `backend/src/voice/deepgramTts.ts`

- [ ] Implementar:
```ts
import WebSocket from 'ws';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export interface TtsSession {
  speak(text: string): Promise<void>;
  close(): void;
  onAudio(cb: (mulaw: Buffer) => void): void;
  onFlushed(cb: () => void): void;
}

export function openTtsSession(): TtsSession {
  const url = new URL('wss://api.deepgram.com/v1/speak');
  url.searchParams.set('model', config.TTS_VOICE_ID);
  url.searchParams.set('encoding', 'mulaw');
  url.searchParams.set('sample_rate', '8000');
  url.searchParams.set('container', 'none');

  const ws = new WebSocket(url.toString(), {
    headers: { Authorization: `Token ${config.DEEPGRAM_API_KEY}` },
  });

  let onAudio: (b: Buffer) => void = () => {};
  let onFlushed: () => void = () => {};
  const pending: string[] = [];
  let open = false;

  ws.on('open', () => {
    open = true;
    for (const t of pending) {
      ws.send(JSON.stringify({ type: 'Speak', text: t }));
      ws.send(JSON.stringify({ type: 'Flush' }));
    }
    pending.length = 0;
  });
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      onAudio(data as Buffer);
    } else {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'Flushed') onFlushed();
      } catch (err) {
        logger.warn({ err }, 'tts parse');
      }
    }
  });
  ws.on('error', (err) => logger.error({ err }, 'tts ws'));

  return {
    async speak(text) {
      if (open) {
        ws.send(JSON.stringify({ type: 'Speak', text }));
        ws.send(JSON.stringify({ type: 'Flush' }));
      } else {
        pending.push(text);
      }
    },
    close() { try { ws.close(); } catch {} },
    onAudio(cb) { onAudio = cb; },
    onFlushed(cb) { onFlushed = cb; },
  };
}
```

- [ ] Commit.

---

## Phase 6 — InterviewSession (orquestador)

### Task 6.1: Tipos e interfaz del socket

**Files:**
- Create: `backend/src/voice/types.ts`

- [ ] Implementar:
```ts
export interface TwilioMediaSocket {
  streamSid: string;
  onInboundAudio(cb: (mulaw: Buffer) => void): void;
  onClose(cb: () => void): void;
  sendOutboundAudio(mulaw: Buffer): void;
  sendMark(name: string): void;
  close(): void;
}
```

- [ ] Commit.

### Task 6.2: InterviewSession

**Files:**
- Create: `backend/src/voice/InterviewSession.ts`

- [ ] Implementar:
```ts
import { prisma } from '../db/prisma.js';
import { openSttSession, SttSession } from './deepgramStt.js';
import { openTtsSession, TtsSession } from './deepgramTts.js';
import { TwilioMediaSocket } from './types.js';
import { qwenComplete } from '../llm/qwenClient.js';
import { scoreAnswer } from '../llm/evaluator.js';
import { SYSTEM_INTERVIEWER, summaryPrompt } from '../llm/prompts.js';
import { logger } from '../lib/logger.js';

type Phase = 'greeting' | 'asking' | 'listening' | 'closing' | 'done';

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
      id: q.id, text: q.text, rubricText: q.rubricText,
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

    await this.tts.speak(
      `Hola ${interview.candidate.fullName}, soy la asistente de reclutamiento. Te voy a hacer ${this.questions.length} preguntas breves sobre la posición de ${interview.job.title}. Empezamos.`,
    );
    this.phase = 'asking';
    await this.askCurrent();
  }

  private async askCurrent() {
    if (this.currentIdx >= this.questions.length) return this.closeOut();
    const q = this.questions[this.currentIdx];
    const turn = await prisma.interviewTurn.create({
      data: { interviewId: this.interviewId, questionId: q.id },
    });
    this.currentTurnId = turn.id;
    this.reaskedForCurrent = false;
    this.listening = false;
    await this.tts.speak(q.text);
    this.phase = 'listening';
  }

  private async handleFinalTranscript(text: string) {
    if (!this.listening || this.phase !== 'listening') return;
    this.answerBuffer += (this.answerBuffer ? ' ' : '') + text;

    setTimeout(() => this.maybeAdvance(), 800);
  }

  private debounceTimer: NodeJS.Timeout | null = null;
  private maybeAdvance() {
    if (!this.listening) return;
    const text = this.answerBuffer.trim();
    if (!text) return;
    this.listening = false;
    this.processAnswer(text).catch((err) => logger.error({ err }, 'processAnswer'));
  }

  private async processAnswer(text: string) {
    if (!this.currentTurnId) return;
    const q = this.questions[this.currentIdx];

    await prisma.interviewTurn.update({
      where: { id: this.currentTurnId },
      data: { candidateResponseText: text },
    });

    const decisionRaw = await qwenComplete({
      messages: [
        { role: 'system', content: SYSTEM_INTERVIEWER },
        {
          role: 'user',
          content: `Pregunta: ${q.text}\nRespuesta: ${text}\n¿La respuesta es suficiente para puntuar (sí/no)? Si no, ¿qué aclaración pedir? Devolvé JSON: { "sufficient": true|false, "reask": "..." | null }`,
        },
      ],
      responseFormat: 'json_object',
      temperature: 0.2,
    });

    let sufficient = true;
    let reask: string | null = null;
    try {
      const parsed = JSON.parse(decisionRaw);
      sufficient = !!parsed.sufficient;
      reask = parsed.reask ?? null;
    } catch {}

    if (!sufficient && !this.reaskedForCurrent && reask) {
      this.reaskedForCurrent = true;
      await this.tts.speak(reask);
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
      data: { score: score.score ?? undefined, scoreJustification: score.justification ?? undefined },
    });

    this.currentIdx++;
    await this.askCurrent();
  }

  private async closeOut() {
    this.phase = 'closing';
    await this.tts.speak('Eso fue todo. Muchas gracias por tu tiempo. Vamos a estar en contacto. ¡Hasta luego!');
    setTimeout(() => this.finalize(), 4000);
  }

  private async finalize() {
    this.phase = 'done';
    await this.computeSummary();
    try { this.socket.close(); } catch {}
    this.stt.close(); this.tts.close();
  }

  private async computeSummary() {
    const interview = await prisma.interview.findUniqueOrThrow({
      where: { id: this.interviewId },
      include: { job: true, turns: { include: { question: true } } },
    });
    const scored = interview.turns.filter((t) => t.score != null).map((t) => t.score!);
    const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
    const transcript = interview.turns
      .map((t) => `Q: ${t.question?.text}\nA: ${t.candidateResponseText ?? ''}`)
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
      logger.warn({ err }, 'summary failed');
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
    await prisma.interview.update({
      where: { id: this.interviewId },
      data: {
        status: this.phase === 'closing' ? 'completed' : 'failed',
        endedAt: new Date(),
      },
    });
    this.stt.close(); this.tts.close();
  }
}
```

- [ ] Commit.

### Task 6.3: WebSocket Twilio handler

**Files:**
- Create: `backend/src/voice/ws.ts`

- [ ] Implementar:
```ts
import { FastifyInstance } from 'fastify';
import { InterviewSession } from './InterviewSession.js';
import { decodeInboundMedia, encodeMark, encodeOutboundMedia, TwilioInboundMessage } from './twilioFraming.js';
import { logger } from '../lib/logger.js';

export async function mediaWsRoute(app: FastifyInstance) {
  app.get('/media', { websocket: true }, (conn, req) => {
    const url = new URL(req.url, 'http://x');
    const interviewId = url.searchParams.get('interviewId');
    if (!interviewId) { conn.socket.close(); return; }

    let streamSid = '';
    let onAudio: (b: Buffer) => void = () => {};
    let onClose: () => void = () => {};
    let session: InterviewSession | null = null;

    const socket = {
      get streamSid() { return streamSid; },
      onInboundAudio(cb: (b: Buffer) => void) { onAudio = cb; },
      onClose(cb: () => void) { onClose = cb; },
      sendOutboundAudio(buf: Buffer) {
        if (streamSid) conn.socket.send(JSON.stringify(encodeOutboundMedia(streamSid, buf)));
      },
      sendMark(name: string) {
        if (streamSid) conn.socket.send(JSON.stringify(encodeMark(streamSid, name)));
      },
      close() { conn.socket.close(); },
    };

    conn.socket.on('message', async (raw) => {
      let msg: TwilioInboundMessage;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        session = new InterviewSession(interviewId, socket as any);
        session.start().catch((err) => logger.error({ err }, 'session start'));
      } else if (msg.event === 'media') {
        const buf = decodeInboundMedia(msg);
        if (buf) onAudio(buf);
      } else if (msg.event === 'stop') {
        onClose();
      }
    });
    conn.socket.on('close', () => onClose());
  });
}
```

- [ ] Registrar en `server.ts`.
- [ ] Commit.

---

## Phase 7 — TwiML y Twilio dialer

### Task 7.1: TwiML routes

**Files:**
- Create: `backend/src/http/twiml.routes.ts`

- [ ] Implementar:
```ts
import { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';

export async function twimlRoutes(app: FastifyInstance) {
  app.get('/twiml/answer', async (req, reply) => {
    const { interviewId } = req.query as { interviewId: string };
    const wsUrl = config.PUBLIC_BASE_URL.replace(/^http/, 'ws') + `/media?interviewId=${interviewId}`;
    reply.type('text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" />
  </Connect>
</Response>`,
    );
  });

  app.post('/twilio/status', async (req) => {
    const body = req.body as Record<string, string>;
    const sid = body.CallSid;
    const status = body.CallStatus;
    const interview = await prisma.interview.findFirst({ where: { twilioCallSid: sid } });
    if (!interview) return { ok: true };
    if (status === 'no-answer' || status === 'busy' || status === 'failed') {
      await prisma.interview.update({
        where: { id: interview.id },
        data: { status: status === 'no-answer' ? 'no_answer' : 'failed' },
      });
    }
    return { ok: true };
  });
}
```

- [ ] Commit.

### Task 7.2: Dialer scheduler

**Files:**
- Create: `backend/src/scheduler/dialer.ts`

- [ ] Implementar:
```ts
import twilio from 'twilio';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';

const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

export function startDialer() {
  const tick = async () => {
    try {
      const due = await prisma.interview.findMany({
        where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
        include: { candidate: true },
        take: 5,
      });
      for (const iv of due) {
        const call = await client.calls.create({
          to: iv.candidate.phoneE164,
          from: config.TWILIO_FROM_NUMBER,
          url: `${config.PUBLIC_BASE_URL}/twiml/answer?interviewId=${iv.id}`,
          statusCallback: `${config.PUBLIC_BASE_URL}/twilio/status`,
          statusCallbackEvent: ['initiated', 'answered', 'completed'],
        });
        await prisma.interview.update({
          where: { id: iv.id },
          data: { status: 'dialing', twilioCallSid: call.sid },
        });
        logger.info({ interviewId: iv.id, sid: call.sid }, 'dialed');
      }
    } catch (err) {
      logger.error({ err }, 'dialer tick');
    }
  };
  setInterval(tick, 30000);
  tick();
}
```

- [ ] Invocar `startDialer()` desde `server.ts` después de `app.listen`.
- [ ] Commit.

### Task 7.3: Registrar todas las rutas

**Files:**
- Modify: `backend/src/server.ts`

- [ ] Editar para registrar `jobsRoutes`, `questionsRoutes`, `candidatesRoutes`, `interviewsRoutes`, `twimlRoutes`, `mediaWsRoute` y arrancar `startDialer`.

- [ ] Commit.

---

## Phase 8 — Frontend React

### Task 8.1: Scaffold Vite + deps

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`

- [ ] `frontend/package.json`:
```json
{
  "name": "frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] `frontend/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, '') } } },
});
```

- [ ] `frontend/tsconfig.json` análogo extendiendo `../tsconfig.base.json` con JSX.
- [ ] `frontend/index.html` estándar Vite.
- [ ] Commit.

### Task 8.2: API client + router shell

**Files:**
- Create: `frontend/src/api/client.ts`, `frontend/src/App.tsx`, `frontend/src/main.tsx`

- [ ] `api/client.ts`:
```ts
const BASE = '/api';
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}
export const api = {
  jobs: {
    list: () => req<any[]>('/jobs'),
    get: (id: string) => req<any>(`/jobs/${id}`),
    create: (body: any) => req<any>('/jobs', { method: 'POST', body: JSON.stringify(body) }),
    addQuestion: (id: string, q: any) => req(`/jobs/${id}/questions`, { method: 'POST', body: JSON.stringify(q) }),
  },
  candidates: {
    list: () => req<any[]>('/candidates'),
    create: (body: any) => req<any>('/candidates', { method: 'POST', body: JSON.stringify(body) }),
  },
  interviews: {
    list: () => req<any[]>('/interviews'),
    get: (id: string) => req<any>(`/interviews/${id}`),
    schedule: (body: any) => req<any>('/interviews', { method: 'POST', body: JSON.stringify(body) }),
  },
};
```

- [ ] `App.tsx` con `BrowserRouter`, `QueryClientProvider`, navegación lateral.
- [ ] Commit.

### Task 8.3: Páginas

**Files:**
- Create: `frontend/src/pages/JobsPage.tsx`, `JobDetailPage.tsx`, `CandidatesPage.tsx`, `ScheduleInterviewPage.tsx`, `InterviewResultPage.tsx`, `InterviewsListPage.tsx`

- [ ] Implementar cada página con TanStack Query (`useQuery` / `useMutation`):
  - `JobsPage`: lista + form crear.
  - `JobDetailPage`: detalle de job + lista de preguntas + form para agregar (`text`, `rubricText`, `order`).
  - `CandidatesPage`: lista + form (`fullName`, `phoneE164`, `email`).
  - `ScheduleInterviewPage`: selector job + candidate + datetime → `api.interviews.schedule`.
  - `InterviewsListPage`: tabla con status, link a detalle.
  - `InterviewResultPage`: muestra `interview.summary`, `overallScore`, tabla de `turns` (pregunta, respuesta, score, justificación).

Ejemplo (`InterviewResultPage`):
```tsx
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function InterviewResultPage() {
  const { id } = useParams();
  const { data } = useQuery({ queryKey: ['interview', id], queryFn: () => api.interviews.get(id!) });
  if (!data) return <p>Cargando...</p>;
  return (
    <div>
      <h2>{data.candidate.fullName} — {data.job.title}</h2>
      <p>Status: {data.status} · Score: {data.overallScore ?? '—'}</p>
      <p><strong>Resumen:</strong> {data.summary ?? '—'}</p>
      <table>
        <thead><tr><th>Pregunta</th><th>Respuesta</th><th>Score</th><th>Justificación</th></tr></thead>
        <tbody>
          {data.turns.map((t: any) => (
            <tr key={t.id}>
              <td>{t.question?.text}</td>
              <td>{t.candidateResponseText}</td>
              <td>{t.score ?? '—'}</td>
              <td>{t.scoreJustification ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] Commit por página o en lote pequeño.

---

## Phase 9 — Smoke test E2E manual

### Task 9.1: Checklist E2E

**Files:**
- Create: `docs/E2E.md`

- [ ] Documentar pasos:
  1. `docker-compose up -d`, `cd backend && pnpm prisma migrate dev`.
  2. `pnpm -C backend dev` y `pnpm -C frontend dev`.
  3. `ngrok http 3000` → setear `PUBLIC_BASE_URL` y configurar webhook en número Twilio.
  4. En el panel: crear Job + 2-3 Questions con rúbrica; crear Candidate con teléfono real; agendar Interview `scheduledAt = now`.
  5. Esperar llamada; responder; verificar transcripción + scores en `InterviewResultPage`.

- [ ] Commit.

---

## Self-Review

- **Spec coverage:** schema ✓, REST ✓, voice pipeline ✓, scoring ✓, summary ✓, scheduler ✓, frontend MVP ✓, errores básicos ✓.
- **Gaps conscientes:** sin tests E2E automáticos (declarado fuera de alcance); `call_events` definido pero no se persiste activamente — aceptable porque la spec lo marca como auditoría opcional.
- **Placeholders:** ninguno crítico; frontend pages 8.3 son más esqueleto que detallado, pero el patrón está mostrado.
- **Consistencia de tipos:** `InterviewSession` ↔ `TwilioMediaSocket` ↔ `ws.ts` usan el mismo shape; `score | null` consistente en `evaluator` y persistencia.
