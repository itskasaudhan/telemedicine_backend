const router = require('express').Router();
const wrap = require('../../utils/wrap');
const { authenticate } = require('../../middleware/auth');
const service = require('./doctors.service');
const availability = require('../availability/availability.service');

router.get('/', authenticate, wrap(async (req, res) => {
  res.json(await service.list(req.query));
}));

router.get('/:id/slots', authenticate, wrap(async (req, res) => {
  res.json(await availability.listOpen(req.params.id, req.query));
}));

module.exports = router;