# IA Reclutadora — Diseño (MVP)

Fecha: 2026-05-24
Estado: Aprobado

## 1. Resumen

Sistema que realiza entrevistas telefónicas automatizadas a candidatos: agendada desde un panel React, la IA llama por Twilio, conversa en español usando Deepgram STT, Qwen3 (vía API) y Deepgram Aura TTS, y persiste transcripción + score 1-5 por pregunta en PostgreSQL.

## 2. Stack

- **Backend:** Node.js + TypeScript, Fastify (REST + WebSocket), Prisma ORM, Zod, pino.
- **DB:** PostgreSQL.
- **Frontend:** Vite + React + TanStack Query.
- **Telefonía:** Twilio Media Streams (WebSocket bidireccional, μ-law 8kHz).
- **STT:** Deepgram (`nova-2`, `language=es`, `interim_results=true`, `endpointing=300`).
- **LLM:** Qwen3 vía API (DashScope u OpenRouter), `response_format: json_object` para scoring.
- **TTS:** Deepgram Aura-2 (voz española, p.ej. `aura-2-celeste-es`), salida `mulaw 8000` para reenviar directo a Twilio.

## 3. Arquitectura

Un único proceso Node expone:
- REST API (`/jobs`, `/questions`, `/candidates`, `/interviews`, `/twiml/*`).
- WebSocket `/media` para Twilio Media Streams.
- Scheduler interno (cron 30s) que dispara llamadas agendadas.

```
React SPA ──HTTPS──► Node (Fastify) ◄──webhook── Twilio
                        │
                  ┌─────┴─────┐
                  ▼           ▼
                  Postgres   InterviewSession (por llamada)
                              ├── Deepgram STT (WS)
                              ├── Qwen3 (HTTPS)
                              └── Deepgram Aura TTS (WS)
```

Razón de monolito: el cuello de botella es latencia del pipeline STT→LLM→TTS, no concurrencia. Separar servicios si más adelante hace falta escalar voice.

## 4. Modelo de datos

```
jobs(id, title, description, language='es', voice_id, created_at)
questions(id, job_id FK, order, text, rubric_text, max_score=5)
candidates(id, full_name, phone_e164, email, notes, created_at)
interviews(id, job_id, candidate_id, status, scheduled_at, started_at,
           ended_at, twilio_call_sid, recording_url, overall_score, summary)
  status ∈ {scheduled, dialing, in_progress, completed, failed, no_answer}
interview_turns(id, interview_id, question_id NULL, asked_at,
                candidate_response_text, response_audio_url, score, score_justification)
call_events(id, interview_id, ts, kind, payload jsonb)
  kind ∈ {dial, answer, stt_partial, stt_final, llm_request, llm_response, tts_chunk, hangup, error}
```

Notas:
- Una sola voz por job.
- `interview_turns` se llena por orden conforme avanza la entrevista; score se completa post-respuesta.
- `call_events` para debug; purgable por TTL.

## 5. Flujo end-to-end

1. **Agenda:** reclutador crea Job + Questions con rúbrica; carga Candidate; agenda Interview con `scheduled_at`.
2. **Dialer:** worker cron busca `status=scheduled AND scheduled_at<=now()`, llama `twilio.calls.create(...)`, marca `dialing`.
3. **TwiML:** Twilio hace GET a `/twiml/answer?interviewId=X`, responde `<Connect><Stream url="wss://.../media?interviewId=X"/></Connect>`.
4. **Sesión de media:** se crea `InterviewSession` que abre WS a Deepgram STT, mantiene historial Qwen, estado `currentQuestionIdx` y `phase`.
5. **Loop por turno:**
   - TTS de la pregunta (Aura WS, μ-law 8000) → reenvío como `media` frames a Twilio con `streamSid`.
   - Audio de Twilio entrante → forward a Deepgram STT.
   - STT `is_final=true` → guardar respuesta.
   - Evaluación con Qwen (`{question, rubric, response}` → `{score, justification}`) → persistir.
   - Decisión: avanzar a siguiente pregunta o una re-pregunta (máx 1).
6. **Cierre:** TTS despedida → hangup → `status=completed`, `overall_score=avg(scores)`, `summary` generado por Qwen.

**Errores:**
- No contesta → `status=no_answer` vía Twilio `StatusCallback`.
- Cuelga mid-interview → `status=failed`, se guarda lo capturado.
- Falla STT/TTS/LLM → log, TTS de fallback ("disculpá, tuvimos un problema técnico"), hangup.

**Barge-in:** fuera de MVP. Turnos estrictos.

## 6. Estructura de código

```
backend/
  src/
    server.ts, config.ts
    db/{prisma.ts, schema.prisma}
    http/{jobs,questions,candidates,interviews,twiml}.routes.ts
    voice/{ws.ts, InterviewSession.ts, deepgramStt.ts, deepgramTts.ts, twilioFraming.ts}
    llm/{qwenClient.ts, prompts.ts, evaluator.ts}
    scheduler/dialer.ts
    lib/{logger.ts, errors.ts}
  prisma/migrations/
  tests/
frontend/
  src/
    main.tsx, App.tsx
    api/client.ts
    pages/{JobsPage,JobDetailPage,CandidatesPage,ScheduleInterviewPage,InterviewResultPage}.tsx
    components/
docs/superpowers/specs/
docker-compose.yml   # postgres
```

Aislamiento:
- `InterviewSession` recibe una interfaz `TwilioMediaSocket`; no conoce Fastify ni HTTP.
- `qwenClient`, `deepgramStt`, `deepgramTts` son adaptadores reemplazables.
- Frontend solo habla con REST del backend.

## 7. API REST

```
POST   /jobs                       { title, description, voiceId? }
GET    /jobs                       → Job[]
GET    /jobs/:id                   → Job + questions[]
POST   /jobs/:id/questions         { text, rubricText, order }
PATCH  /questions/:id              { text?, rubricText?, order? }
DELETE /questions/:id

POST   /candidates                 { fullName, phoneE164, email?, notes? }
GET    /candidates                 → Candidate[]

POST   /interviews                 { jobId, candidateId, scheduledAt }
GET    /interviews                 ?status=&jobId=
GET    /interviews/:id             → Interview + turns[]
POST   /interviews/:id/cancel

GET    /twiml/answer?interviewId=
POST   /twilio/status              # statusCallback
WS     /media?interviewId=
```

Payloads validados con Zod. Errores `{ error: { code, message } }`.

## 8. Prompts (Qwen3)

- **System (conversación):** profesional, español, una pregunta a la vez, no inventa información, máximo una re-pregunta por question.
- **Scoring (por turno):**
  ```
  Pregunta: {question.text}
  Rúbrica (1-5): {question.rubricText}
  Respuesta candidato: {turn.response}
  Devolvé JSON: { "score": 1..5, "justification": "..." }
  ```
  Forzado con `response_format: json_object`, validado Zod, 1 reintento, fallback `score=null`.
- **Summary (final):** historial + scores → 3-4 oraciones.

## 9. Testing

- **Unit:** `evaluator.ts`, prompts (snapshots), framing μ-law, `InterviewSession` con mocks STT/LLM/TTS.
- **Integration:** REST contra Postgres efímero (testcontainers).
- **E2E manual:** Twilio test number + ngrok; checklist documentado.
- Sin E2E automático de la llamada en MVP.

## 10. Configuración y despliegue

Variables `.env`:
- `DATABASE_URL`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `DEEPGRAM_API_KEY`
- `QWEN_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL`
- `PUBLIC_BASE_URL` (URL pública del backend, ngrok en dev)
- `TTS_VOICE_ID` (p.ej. `aura-2-celeste-es`)
- `STT_LANGUAGE=es`, `STT_MODEL=nova-2`

Dev: `docker-compose up` (postgres) + `pnpm dev` (backend) + `pnpm dev` (frontend) + `ngrok http 3000`.

## 11. Fuera de alcance (MVP)

Auth/roles, multi-tenant, barge-in, reintentos automáticos, grabación de audio en S3, métricas/dashboards, exportación CSV, i18n, soporte móvil del panel.
