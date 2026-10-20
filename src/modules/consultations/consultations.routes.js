const router = require('express').Router();
const wrap = require('../../utils/wrap');
const validate = require('../../middleware/validate');
const AppError = require('../../utils/AppError');
const { authenticate, authorize } = require('../../middleware/auth');
const schemas = require('./consultations.schemas');
const service = require('./consultations.service');

router.post('/', authenticate, authorize('patient'), validate(schemas.book), wrap(async (req, res) => {
  const key = schemas.idempotencyKey.safeParse(req.get('Idempotency-Key'));
  if (!key.success) throw new AppError(400, 'Idempotency-Key header required (8-100 chars)');
  const result = await service.book({
    patientId: req.user.id,
    slotId: req.body.slotId,
    idempotencyKey: key.data,
    ip: req.ip,
  });
  res.status(result.replayed ? 200 : 201).json(result.consultation);
}));

router.get('/:id', authenticate, wrap(async (req, res) => {
  res.json(await service.getById(req.user, req.params.id));
}));

module.exports = router;