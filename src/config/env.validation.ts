import * as Joi from "joi";

export const envValidationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default("api/v1"),

  // Database — required, must be a postgres URL
  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgresql", "postgres"] })
    .required(),

  // JWT — secrets must be at least 64 chars (256-bit entropy minimum)
  JWT_ACCESS_SECRET: Joi.string().min(64).required(),
  JWT_REFRESH_SECRET: Joi.string()
    .min(64)
    .invalid(Joi.ref("JWT_ACCESS_SECRET"))
    .required()
    .messages({
      "any.invalid":
        "JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET",
    }),
  JWT_ACCESS_EXPIRATION: Joi.string().default("15m"),
  JWT_REFRESH_EXPIRATION: Joi.string().default("7d"),

  // Bcrypt
  BCRYPT_ROUNDS: Joi.number().min(10).max(14).default(12),

  // CORS
  CORS_ORIGINS: Joi.string().required(),

  // Rate limiting
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),

  // Login lockout — intentos fallidos consecutivos antes de bloquear la cuenta
  LOGIN_MAX_ATTEMPTS: Joi.number().min(1).default(5),

  // Upload
  UPLOAD_DEST: Joi.string().default("./uploads"),
  MAX_FILE_SIZE: Joi.number().default(10485760),

  // AWS S3 — required for file uploads
  AWS_REGION: Joi.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  AWS_S3_BUCKET: Joi.string().required(),

  // Redis — optional; required for multi-instance deployments
  // When absent, JWT denylist and rate limiting fall back to in-memory (single-pod safe)
  REDIS_URL: Joi.string().uri({ scheme: ["redis", "rediss"] }).optional(),

  // Logs
  LOG_LEVEL: Joi.string()
    .valid("error", "warn", "info", "debug", "verbose")
    .default("info"),
  LOG_DIR: Joi.string().default("./logs"),
}).options({ allowUnknown: true });
