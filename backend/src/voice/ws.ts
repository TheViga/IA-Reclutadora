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
  app.get('/media', { websocket: true }, (conn: any, req) => {
    const ws = conn.socket ?? conn;
    logger.info('twilio ws connected');

    let interviewId = '';
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
        if (streamSid && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(encodeOutboundMedia(streamSid, buf)));
        }
      },
      sendMark(name) {
        if (streamSid && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(encodeMark(streamSid, name)));
        }
      },
      close() {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      },
    };

    ws.on('message', (raw: Buffer) => {
      let msg: TwilioInboundMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        interviewId = msg.start.customParameters?.interviewId ?? '';
        logger.info({ interviewId, streamSid }, 'twilio media stream started');
        if (!interviewId) {
          logger.error('no interviewId in start event, closing');
          ws.close();
          return;
        }
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
    ws.on('close', () => onClose());
    ws.on('error', (err: Error) =>
      logger.error({ err }, 'twilio ws error'),
    );
  });
}
