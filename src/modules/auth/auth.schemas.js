const { z } = require('zod');

const register = z.object({
  email: z.string().email().max(255).toLowerCase(),
  password: z.string().min(8).max(100),
  role: z.enum(['patient', 'doctor']), // admin is never self-registered
  fullName: z.string().min(2).max(150),
  // required only when role is doctor
  specialty: z.string().min(2).max(100).optional(),
  fee: z.number().positive().optional(),
  licenseNo: z.string().min(3).max(100).optional(),
});

const login = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
  otp: z.string().length(6).optional(),
});

const refresh = z.object({ refreshToken: z.string().min(10) });
const otpOnly = z.object({ otp: z.string().length(6) });

module.exports = { register, login, refresh, otpOnly };