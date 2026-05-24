import WebSocket from 'ws';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export interface TtsSession {
  speak(text: string): void;
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
    speak(text) {
      if (open) {
        ws.send(JSON.stringify({ type: 'Speak', text }));
        ws.send(JSON.stringify({ type: 'Flush' }));
      } else {
        pending.push(text);
      }
    },
    close() {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    },
    onAudio(cb) {
      onAudio = cb;
    },
    onFlushed(cb) {
      onFlushed = cb;
    },
  };
}
