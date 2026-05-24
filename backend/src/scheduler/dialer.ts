import twilio from 'twilio';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';

const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

const TICK_MS = 30_000;

export function startDialer() {
  const tick = async () => {
    try {
      const due = await prisma.interview.findMany({
        where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
        include: { candidate: true },
        take: 5,
      });
      for (const iv of due) {
        try {
          const call = await client.calls.create({
            to: iv.candidate.phoneE164,
            from: config.TWILIO_FROM_NUMBER,
            url: `${config.PUBLIC_BASE_URL}/twiml/answer?interviewId=${iv.id}`,
            statusCallback: `${config.PUBLIC_BASE_URL}/twilio/status`,
            statusCallbackEvent: ['initiated', 'answered', 'completed'],
            statusCallbackMethod: 'POST',
          });
          await prisma.interview.update({
            where: { id: iv.id },
            data: { status: 'dialing', twilioCallSid: call.sid },
          });
          logger.info({ interviewId: iv.id, sid: call.sid }, 'dialed');
        } catch (err) {
          logger.error({ err, interviewId: iv.id }, 'dial failed');
          await prisma.interview.update({
            where: { id: iv.id },
            data: { status: 'failed' },
          });
        }
      }
    } catch (err) {
      logger.error({ err }, 'dialer tick failed');
    }
  };

  setInterval(tick, TICK_MS);
  tick();
}
