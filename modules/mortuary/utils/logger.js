import pino from 'pino';

const defaultLevel = process.env.JEST_WORKER_ID !== undefined ? 'silent' : 'info';

export const logger = pino({
  level: process.env.LOG_LEVEL || defaultLevel,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]',
  },
});
