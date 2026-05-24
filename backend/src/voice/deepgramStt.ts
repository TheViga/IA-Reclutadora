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
      try {
        ws.close();
      } catch {
        /* noop */
      }
    },
    onPartial(cb) {
      onPartial = cb;
    },
    onFinal(cb) {
      onFinal = cb;
    },
  };
}
