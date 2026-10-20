const client = require('prom-client');

// Node ke default metrics (memory, CPU, event loop) automatically
client.collectDefaultMetrics();

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'],
  // buckets assignment ke targets ke aas-paas: 200ms (reads), 500ms (writes)
  buckets: [0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2],
});

const httpTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

function metricsMiddleware(req, res, next) {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    // route pattern use karte hain (/consultations/:id), real id nahi, warna labels bahut ho jayenge
    const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    const labels = { method: req.method, route, status: res.statusCode };
    end(labels);
    httpTotal.inc(labels);
  });
  next();
}

async function metricsHandler(req, res) {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}

module.exports = { metricsMiddleware, metricsHandler };