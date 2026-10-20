const router = require('express').Router();
const wrap = require('../../utils/wrap');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const schemas = require('./availability.schemas');
const service = require('./availability.service');

router.post('/', authenticate, authorize('doctor'), validate(schemas.create), wrap(async (req, res) => {
  res.status(201).json(await service.createSlots(req.user.id, req.body));
}));

router.delete('/:id', authenticate, authorize('doctor'), wrap(async (req, res) => {
  await service.remove(req.user.id, req.params.id);
  res.status(204).end();
}));

module.exports = router;