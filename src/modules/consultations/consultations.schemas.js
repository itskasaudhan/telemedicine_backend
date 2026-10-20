const { z } = require('zod');

const book = z.object({ slotId: z.string().uuid() });
const idempotencyKey = z.string().min(8).max(100);

module.exports = { book, idempotencyKey };