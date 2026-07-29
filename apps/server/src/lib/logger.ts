import pino from 'pino';

const transport = process.env.NODE_ENV !== 'production'
  ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
  : undefined;

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transport,
});
