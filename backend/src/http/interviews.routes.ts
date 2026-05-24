import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import type { InterviewStatus } from '@prisma/client';

const Create = z.object({
  jobId: z.string(),
  candidateId: z.string(),
  scheduledAt: z.coerce.date(),
});

export async function interviewsRoutes(app: FastifyInstance) {
  app.post('/interviews', async (req) => {
    const body = Create.parse(req.body);
    return prisma.interview.create({
      data: { ...body, status: 'scheduled' },
    });
  });

  app.get('/interviews', async (req) => {
    const q = req.query as { status?: InterviewStatus; jobId?: string };
    return prisma.interview.findMany({
      where: {
        status: q.status,
        jobId: q.jobId,
      },
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
        turns: {
          include: { question: true },
          orderBy: { askedAt: 'asc' },
        },
      },
    });
  });

  app.post('/interviews/:id/cancel', async (req) => {
    const { id } = req.params as { id: string };
    return prisma.interview.update({
      where: { id },
      data: { status: 'failed' },
    });
  });
}
