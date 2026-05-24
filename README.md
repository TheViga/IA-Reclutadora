# IA Reclutadora

Un sistema que automatiza entrevistas telefónicas: la IA llama al candidato, hace las preguntas, escucha las respuestas y las puntúa del 1 al 5 en tiempo real. Todo queda guardado con transcripción completa y un resumen automático que el reclutador puede revisar desde el panel web.

---

## Cómo funciona

1. El reclutador carga el puesto con sus preguntas y una rúbrica de evaluación por pregunta.
2. Carga al candidato con su número de teléfono y agenda la entrevista.
3. A la hora programada, el sistema llama automáticamente al candidato por Twilio.
4. Durante la llamada, el audio del candidato se convierte a texto con Deepgram STT. Qwen3 decide si la respuesta fue suficiente (o pide una aclaración), y luego la puntúa según la rúbrica.
5. Las respuestas de la IA se sintetizan con Deepgram Aura TTS y se envían de vuelta como audio en tiempo real.
6. Al colgar, se genera un resumen automático de la entrevista con score promedio.

El panel React muestra la transcripción turno por turno, el score de cada pregunta con su justificación y el resumen final.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node 20 + TypeScript + Fastify |
| Base de datos | PostgreSQL + Prisma |
| Telefonía | Twilio Media Streams (WebSocket, μ-law 8kHz) |
| STT | Deepgram nova-2 (español) |
| LLM | Qwen3 vía API OpenAI-compatible (DashScope / OpenRouter) |
| TTS | Deepgram Aura-2 (`aura-2-celeste-es`) |
| Frontend | Vite + React + TanStack Query |

---

## Estructura del proyecto

```
ia-reclutadora/
├── backend/
│   ├── src/
│   │   ├── http/          # Rutas REST (jobs, candidates, interviews, TwiML)
│   │   ├── voice/         # Pipeline de audio: STT, TTS, InterviewSession
│   │   ├── llm/           # Cliente Qwen, prompts, evaluador de respuestas
│   │   └── scheduler/     # Cron que dispara las llamadas agendadas
│   └── prisma/            # Schema y migrations
└── frontend/
    └── src/
        └── pages/         # Jobs, Candidatos, Agendar, Lista y Resultado de entrevistas
```

---

## Requisitos

- Node 20+
- pnpm
- Docker (para Postgres local)
- Cuenta Twilio con un número con voz saliente habilitada
- API key de Deepgram
- API key de Qwen3 (DashScope o OpenRouter)
- ngrok (para exponer el backend a Twilio en desarrollo)

---

## Instalación y uso

### 1. Levantar la base de datos

```bash
docker compose up -d
```

### 2. Variables de entorno

```bash
cp .env.example backend/.env
```

Completar en `backend/.env`:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM_NUMBER=+1xxxxxxxxxx
DEEPGRAM_API_KEY=xxxxxxxx
QWEN_API_KEY=xxxxxxxx
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
PUBLIC_BASE_URL=https://<tu-ngrok>.ngrok-free.app
```

### 3. Backend

```bash
cd backend
pnpm install
pnpm prisma:migrate
pnpm dev
```

### 4. Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Abrir [http://localhost:5173](http://localhost:5173).

### 5. Exponer el backend a Twilio

```bash
ngrok http 3000
```

Copiar la URL https de ngrok y pegarla en `PUBLIC_BASE_URL` dentro de `backend/.env`. Reiniciar el backend.

> Twilio necesita acceso público al endpoint `/twiml/answer` para saber qué hacer cuando el candidato atiende, y al WebSocket `/media` para el streaming de audio bidireccional.

---

## Prueba end-to-end

Ver [docs/E2E.md](docs/E2E.md) — tiene el checklist paso a paso para probar con una llamada real, incluyendo qué datos de prueba cargar y qué verificar en el resultado.

---

## Variables de entorno disponibles

| Variable | Descripción | Default |
|---|---|---|
| `DATABASE_URL` | Conexión a Postgres | — |
| `PORT` | Puerto del backend | `3000` |
| `PUBLIC_BASE_URL` | URL pública del backend (ngrok en dev) | — |
| `TWILIO_ACCOUNT_SID` | SID de la cuenta Twilio | — |
| `TWILIO_AUTH_TOKEN` | Auth token de Twilio | — |
| `TWILIO_FROM_NUMBER` | Número Twilio en formato E.164 | — |
| `DEEPGRAM_API_KEY` | API key de Deepgram | — |
| `QWEN_API_KEY` | API key de Qwen | — |
| `QWEN_BASE_URL` | Base URL de la API de Qwen | DashScope |
| `QWEN_MODEL` | Modelo a usar | `qwen-plus` |
| `TTS_VOICE_ID` | Voz de Aura-2 | `aura-2-celeste-es` |
| `STT_LANGUAGE` | Idioma para STT | `es` |
| `STT_MODEL` | Modelo Deepgram STT | `nova-2` |

---

## Qué falta (scope del MVP)

- Autenticación y roles de usuario
- Barge-in (interrumpir a la IA mientras habla)
- Reintentos automáticos si el candidato no atiende
- Grabación del audio en S3
- Dashboard con métricas y comparación entre candidatos
- Exportación a CSV
