import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv:    process.env.NODE_ENV || 'development',
  port:       parseInt(process.env.PORT || '3000', 10),
  apiPrefix:  process.env.API_PREFIX || 'api/v1',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  throttleTtl:   parseInt(process.env.THROTTLE_TTL || '60', 10),
  throttleLimit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  systemName:    process.env.SYSTEM_NAME || 'Notaria Sistema',
  systemVersion: process.env.SYSTEM_VERSION || '1.0.0',
}));
