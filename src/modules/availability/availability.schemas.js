const { z } = require('zod');

const create = z.object({
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  slotMinutes: z.number().int().min(10).max(120).default(30),
}).refine((d) => new Date(d.endTime) > new Date(d.startTime), { message: 'endTime must be after startTime' })
  .refine((d) => new Date(d.endTime) - new Date(d.startTime) <= 24 * 3600 * 1000, { message: 'Max 24 hours per request' });

const listOpen = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

module.exports = { create, listOpen };