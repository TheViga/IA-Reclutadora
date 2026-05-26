import { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export async function twimlRoutes(app: FastifyInstance) {
  app.get('/twiml/answer', async (req, reply) => {
    const { interviewId } = req.query as { interviewId: string };
    logger.info({ interviewId }, 'twiml/answer hit');
    const wsUrl = config.PUBLIC_BASE_URL.replace(/^http/, 'ws') + '/media';
    logger.info({ wsUrl }, 'twiml wsUrl generated');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(wsUrl)}">
      <Parameter name="interviewId" value="${escapeXml(interviewId)}" />
    </Stream>
  </Connect>
</Response>`;
    reply.type('text/xml').send(xml);
  });

  app.post('/twilio/status', async (req) => {
    const body = req.body as Record<string, string>;
    const sid = body.CallSid;
    const status = body.CallStatus;
    if (!sid) return { ok: true };

    const interview = await prisma.interview.findFirst({
      where: { twilioCallSid: sid },
    });
    if (!interview) return { ok: true };

    if (status === 'no-answer') {
      await prisma.interview.update({
        where: { id: interview.id },
        data: { status: 'no_answer' },
      });
    } else if (status === 'busy' || status === 'failed' || status === 'canceled') {
      if (interview.status === 'dialing') {
        await prisma.interview.update({
          where: { id: interview.id },
          data: { status: 'failed' },
        });
      }
    }
    return { ok: true };
  });
}
