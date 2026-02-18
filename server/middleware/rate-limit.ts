import rateLimit from "express-rate-limit";

export const searchRateLimiter = rateLimit({
  windowMs: 10 * 1000, // ⏱️ 10 saat
  max: 10, // ❌ max 10 request
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: "Too many search requests. Please slow down.",
  },
});
