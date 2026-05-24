import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';

const Create = z.object({
  fullName: z.string().min(1),
  phoneE164: z.string().regex(/^\+\d{8,15}$/, 'phoneE164 inválido'),
  email: z.string().email().optional(),
  notes: z.string().optional(),
});

export async function candidatesRoutes(app: FastifyInstance) {
  app.post('/candidates', async (req) => {
    const body = Create.parse(req.body);
    return prisma.candidate.create({ data: body });
  });

  app.get('/candidates', async () =>
    prisma.candidate.findMany({ orderBy: { createdAt: 'desc' } }),
  );

  app.get('/candidates/:id', async (req) => {
    const { id } = req.params as { id: string };
    return prisma.candidate.findUniqueOrThrow({ where: { id } });
  });

  app.patch('/candidates/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = Create.partial().parse(req.body);
    return prisma.candidate.update({ where: { id }, data: body });
  });

  app.delete('/candidates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.candidate.delete({ where: { id } });
    reply.code(204);
  });
}
