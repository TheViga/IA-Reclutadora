import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';

const Create = z.object({
  text: z.string().min(1),
  rubricText: z.string().min(1),
  order: z.number().int().nonnegative(),
});

export async function questionsRoutes(app: FastifyInstance) {
  app.post('/jobs/:jobId/questions', async (req) => {
    const { jobId } = req.params as { jobId: string };
    const body = Create.parse(req.body);
    return prisma.question.create({ data: { ...body, jobId } });
  });

  app.patch('/questions/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = Create.partial().parse(req.body);
    return prisma.question.update({ where: { id }, data: body });
  });

  app.delete('/questions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.question.delete({ where: { id } });
    reply.code(204);
  });
}
