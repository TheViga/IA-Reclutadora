import { FastifyInstance } from 'fastify';
import { InterviewSession } from './InterviewSession.js';
import {
  decodeInboundMedia,
  encodeMark,
  encodeOutboundMedia,
  TwilioInboundMessage,
} from './twilioFraming.js';
import { TwilioMediaSocket } from './types.js';
import { logger } from '../lib/logger.js';

export async function mediaWsRoute(app: FastifyInstance) {
  app.get('/media', { websocket: true }, (conn, req) => {
    const url = new URL(req.url ?? '/media', 'http://x');
    const interviewId = url.searchParams.get('interviewId');
    if (!interviewId) {
      conn.socket.close();
      return;
    }

    let streamSid = '';
    let onAudio: (b: Buffer) => void = () => {};
    let onClose: () => void = () => {};
    let session: InterviewSession | null = null;

    const socket: TwilioMediaSocket = {
      get streamSid() {
        return streamSid;
      },
      onInboundAudio(cb) {
        onAudio = cb;
      },
      onClose(cb) {
        onClose = cb;
      },
      sendOutboundAudio(buf) {
        if (streamSid && conn.socket.readyState === conn.socket.OPEN) {
          conn.socket.send(JSON.stringify(encodeOutboundMedia(streamSid, buf)));
        }
      },
      sendMark(name) {
        if (streamSid && conn.socket.readyState === conn.socket.OPEN) {
          conn.socket.send(JSON.stringify(encodeMark(streamSid, name)));
        }
      },
      close() {
        try {
          conn.socket.close();
        } catch {
          /* noop */
        }
      },
    };

    conn.socket.on('message', (raw: Buffer) => {
      let msg: TwilioInboundMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        session = new InterviewSession(interviewId, socket);
        session.start().catch((err) =>
          logger.error({ err }, 'InterviewSession.start failed'),
        );
      } else if (msg.event === 'media') {
        const buf = decodeInboundMedia(msg);
        if (buf) onAudio(buf);
      } else if (msg.event === 'stop') {
        onClose();
      }
    });
    conn.socket.on('close', () => onClose());
    conn.socket.on('error', (err) =>
      logger.error({ err }, 'twilio ws error'),
    );
  });
}
