const router = require('express').Router();
const { z } = require('zod');
const wrap = require('../../utils/wrap');
const validate = require('../../middleware/validate');
const AppError = require('../../utils/AppError');
const config = require('../../config');
const { authenticate, authorize } = require('../../middleware/auth');
const service = require('./payments.service');

const body = z.object({
  consultationId: z.string().uuid(),
  simulate: z.enum(['fail']).optional(),
});

router.post('/', authenticate, authorize('patient'), validate(body), wrap(async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!key || key.length < 8 || key.length > 100) {
    throw new AppError(400, 'Idempotency-Key header required (8-100 chars)');
  }
  const result = await service.pay({
    patientId: req.user.id,
    consultationId: req.body.consultationId,
    idempotencyKey: key,
    // the failure switch only works outside production
    simulate: config.NODE_ENV === 'production' ? undefined : req.body.simulate,
    ip: req.ip,
  });
  res.status(result.replayed ? 200 : 201).json(result.payment);
}));

module.exports = router;