const router = require('express').Router();
const { z } = require('zod');
const wrap = require('../../utils/wrap');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const service = require('./prescriptions.service');

const body = z.object({
  consultationId: z.string().uuid(),
  content: z.string().min(3).max(5000),
});

// sirf doctor likh sakta hai
router.post('/', authenticate, authorize('doctor'), validate(body), wrap(async (req, res) => {
  res.status(201).json(await service.create({ doctorId: req.user.id, ...req.body, ip: req.ip }));
}));

// patient ya doctor padh sakta hai (service andar check karti hai)
router.get('/consultation/:id', authenticate, wrap(async (req, res) => {
  res.json(await service.getByConsultation({ user: req.user, consultationId: req.params.id, ip: req.ip }));
}));

module.exports = router;