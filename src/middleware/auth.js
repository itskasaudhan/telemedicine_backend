const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('../utils/AppError');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError(401, 'Missing token');
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }
}

// Usage: authorize('admin', 'doctor')
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw new AppError(403, 'Forbidden');
  next();
};

module.exports = { authenticate, authorize };