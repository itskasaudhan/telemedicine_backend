const router = require('express').Router();
const wrap = require('../../utils/wrap');
const { authenticate, authorize } = require('../../middleware/auth');
const service = require('./admin.service');

// is router ke saare routes sirf admin ke liye
router.use(authenticate, authorize('admin'));

router.get('/analytics', wrap(async (req, res) => {
  res.json(await service.analytics());
}));

router.get('/audit-logs', wrap(async (req, res) => {
  res.json(await service.auditLogs(req.query));
}));

module.exports = router;