const config = require('./config');
const { app, logger } = require('./app');

const server = app.listen(config.PORT, () => {
  logger.info(`Server listening on port ${config.PORT}`);
});
require('./jobs/holdExpiry').start(logger);

function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));