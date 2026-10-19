const { ZodError } = require('zod');

function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.flatten().fieldErrors });
  }
  if (err.status) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  req.log?.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;