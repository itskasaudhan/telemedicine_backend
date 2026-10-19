const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const schemas = require('./auth.schemas');
const service = require('./auth.service');

// strict limit on auth endpoints: 10 requests per minute per IP (brute-force protection)
const authLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

// Express 5 forwards async errors automatically; wrap anyway for safety with Express 4
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/register', authLimiter, validate(schemas.register), wrap(async (req, res) => {
  res.status(201).json(await service.register(req.body));
}));

router.post('/login', authLimiter, validate(schemas.login), wrap(async (req, res) => {
  res.json(await service.login(req.body));
}));

router.post('/refresh', authLimiter, validate(schemas.refresh), wrap(async (req, res) => {
  res.json(await service.refresh(req.body.refreshToken));
}));

router.post('/mfa/setup', authenticate, wrap(async (req, res) => {
  res.json(await service.mfaSetup(req.user.id));
}));

router.post('/mfa/verify', authenticate, validate(schemas.otpOnly), wrap(async (req, res) => {
  res.json(await service.mfaVerify(req.user.id, req.body.otp));
}));

module.exports = router;