import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';

const Create = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  companyName: z.string().default(''),
  companyDescription: z.string().default(''),
  salaryRange: z.string().default(''),
  voiceId: z.string().optional(),
});

export async function jobsRoutes(app: FastifyInstance) {
  app.post('/jobs', async (req) => {
    const body = Create.parse(req.body);
    return prisma.job.create({ data: body });
  });

  app.get('/jobs', async () =>
    prisma.job.findMany({ orderBy: { createdAt: 'desc' } }),
  );

  app.get('/jobs/:id', async (req) => {
    const { id } = req.params as { id: string };
    return prisma.job.findUniqueOrThrow({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
  });

  app.patch('/jobs/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = Create.partial().parse(req.body);
    return prisma.job.update({ where: { id }, data: body });
  });

  app.delete('/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.job.delete({ where: { id } });
    reply.code(204);
  });
}
