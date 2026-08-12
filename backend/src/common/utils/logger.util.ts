import * as winston from 'winston';
import 'winston-daily-rotate-file';
import * as path from 'path';

const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';
// Phase 9 (Task 9.7): explicit opt-in for console output in production,
// read directly from process.env here (this module is a plain TS file
// imported before Nest's ConfigModule/ConfigService exist) -- self-hosted
// deployments never set this, so console stays off in production exactly
// as before; container deployments (ECS Fargate, whose CloudWatch Logs
// integration only captures stdout/stderr) set LOG_TO_STDOUT=true.
const LOG_TO_STDOUT = process.env.LOG_TO_STDOUT === 'true';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
    const ctx = context ? `[${context}] ` : '';
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${ctx}${message}${extra}`;
  }),
);

function buildTransports(): winston.transport[] {
  const transports: winston.transport[] = [];

  // Console: always on outside production; in production, only on when
  // explicitly requested via LOG_TO_STDOUT (container deployments -- see
  // the constant's doc comment above). Self-hosted/PM2 production leaves
  // this off, same as before Phase 9, since PM2 already captures stdout
  // to its own out_file/error_file and the rotating file transports below
  // are the durable record there.
  if (NODE_ENV !== 'production' || LOG_TO_STDOUT) {
    transports.push(new winston.transports.Console({ format: consoleFormat }));
  }

  // Rotating file transports: skipped when LOG_TO_STDOUT is set in
  // production. An ECS Fargate container's filesystem is ephemeral --
  // anything written here is lost when the task stops and never reaches
  // CloudWatch (which only captures stdout/stderr via the awslogs driver),
  // so writing them at all in that context is pure wasted disk I/O, not a
  // backup. Self-hosted/PM2 keeps both file transports exactly as before.
  if (!(NODE_ENV === 'production' && LOG_TO_STDOUT)) {
    transports.push(
      new (winston.transports as any).DailyRotateFile({
        dirname: path.join(LOG_DIR, 'combined'),
        filename: 'hdsp-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '50m',
        maxFiles: '30d',
        format: logFormat,
      }),
    );

    transports.push(
      new (winston.transports as any).DailyRotateFile({
        dirname: path.join(LOG_DIR, 'errors'),
        filename: 'hdsp-error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '50m',
        maxFiles: '90d',
        level: 'error',
        format: logFormat,
      }),
    );
  }

  return transports;
}

const rootLogger = winston.createLogger({
  level: LOG_LEVEL,
  transports: buildTransports(),
  exitOnError: false,
});

export function createLogger(context: string) {
  return {
    info:  (msg: string, meta?: object) => rootLogger.info(msg,  { context, ...meta }),
    warn:  (msg: string, meta?: object) => rootLogger.warn(msg,  { context, ...meta }),
    error: (msg: string, meta?: object) => rootLogger.error(msg, { context, ...meta }),
    debug: (msg: string, meta?: object) => rootLogger.debug(msg, { context, ...meta }),
  };
}

export { rootLogger };
