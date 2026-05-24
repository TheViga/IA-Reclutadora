# Checklist E2E manual

Requiere: cuenta Twilio (con número con voz saliente habilitada), cuenta Deepgram, API key de Qwen3 (DashScope u OpenRouter), Docker, Node 20, pnpm, ngrok.

## 1. Setup

- [ ] `docker compose up -d` (Postgres en :5432)
- [ ] Copiar `.env.example` a `backend/.env` y completar todas las variables.
- [ ] `cd backend && pnpm install && pnpm prisma:migrate`
- [ ] `cd frontend && pnpm install`

## 2. Túnel y configuración Twilio

- [ ] `ngrok http 3000` → copiar el URL https.
- [ ] En `backend/.env` setear `PUBLIC_BASE_URL=https://<ngrok>.ngrok-free.app`.
- [ ] En Twilio Console, el número saliente NO necesita webhook entrante: las llamadas son outbound y el TwiML se sirve desde nuestro endpoint `/twiml/answer`.

## 3. Arranque

- [ ] Backend: `cd backend && pnpm dev` (revisar logs: `listening on 3000`).
- [ ] Frontend: `cd frontend && pnpm dev` (abrir http://localhost:5173).
- [ ] Health: `curl https://<ngrok>.../health` → `{"ok":true}`.

## 4. Datos de prueba

- [ ] En el panel, ir a **Puestos** → crear "Recepcionista".
- [ ] Entrar al puesto → agregar 2-3 preguntas con rúbrica, por ejemplo:
   - "Contame brevemente tu experiencia previa atendiendo público." (rúbrica: 5 = 3+ años con ejemplos concretos; 3 = experiencia básica; 1 = sin experiencia.)
   - "¿Por qué te interesa esta posición?" (rúbrica: 5 = motivación específica y alineada; 3 = genérica; 1 = sin respuesta clara.)
- [ ] En **Candidatos**, crear uno con tu teléfono en formato E.164 (`+54911...`).
- [ ] En **Agendar**, elegir puesto + candidato + `scheduledAt = ahora`. Confirmar.

## 5. Llamada

- [ ] Dentro de 30 segundos, el dialer dispara la llamada. Tu teléfono suena.
- [ ] Atender. La IA saluda y arranca preguntas.
- [ ] Responder cada pregunta. Verificar:
   - [ ] Audio fluye en ambos sentidos sin gaps largos (<2s entre tu respuesta y la siguiente pregunta).
   - [ ] Re-pregunta una vez si tu respuesta fue muy corta (decí "no sé" en una de ellas para forzar).
- [ ] Tras la última pregunta, la IA se despide y cuelga.

## 6. Resultado

- [ ] Ir a **Entrevistas** → la entrevista figura `completed`.
- [ ] Click en "Ver" → revisar:
   - [ ] Transcripción por pregunta.
   - [ ] Score 1-5 por turno con justificación.
   - [ ] Score promedio.
   - [ ] Resumen generado por Qwen.

## Troubleshooting

| Síntoma | Causa probable |
|---|---|
| Twilio devuelve 11200 / no conecta WS | `PUBLIC_BASE_URL` mal o ngrok caído. Verificar que el TwiML reemplaza `http→ws` correctamente. |
| La IA no habla | API key Deepgram inválida, o el modelo TTS no soporta español. Probar `aura-2-celeste-es`. |
| STT no entiende | `STT_LANGUAGE=es` y `STT_MODEL=nova-2`. Verificar audio entrante en logs (`media` events). |
| Scoring siempre null | API key Qwen inválida o `QWEN_MODEL` no acepta `response_format: json_object`. Probar `qwen-plus` o `qwen-max`. |
