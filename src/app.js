const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const pino = require('pino');
const pinoHttp = require('pino-http');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./modules/auth/auth.routes');
const doctorRoutes = require('./modules/doctors/doctors.routes');
const availabilityRoutes = require('./modules/availability/availability.routes');
const consultationRoutes = require('./modules/consultations/consultations.routes');
const paymentRoutes = require('./modules/payments/payments.routes');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(pinoHttp({ logger }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRoutes);
app.use('/doctors', doctorRoutes);
app.use('/availability', availabilityRoutes);
app.use('/consultations', consultationRoutes);
app.use('/payments', paymentRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = { app, logger };