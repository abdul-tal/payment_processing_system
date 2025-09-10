import winston from 'winston';

const logLevel = process.env['LOG_LEVEL'] || 'info';
const nodeEnv = process.env['NODE_ENV'] || 'development';

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(
    ({ timestamp, level, message, correlationId, ...meta }: any) => {
      const logEntry = {
        timestamp,
        level,
        message,
        ...(correlationId && { correlationId }),
        ...meta,
      };
      return JSON.stringify(logEntry);
    }
  )
);

// Create the logger
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'payment-backend' },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format:
        nodeEnv === 'development'
          ? winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
          : logFormat,
    }),

    // File transports for production
    ...(nodeEnv === 'production'
      ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
          }),
        ]
      : []),
  ],

  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.Console(),
    ...(nodeEnv === 'production'
      ? [new winston.transports.File({ filename: 'logs/exceptions.log' })]
      : []),
  ],

  rejectionHandlers: [
    new winston.transports.Console(),
    ...(nodeEnv === 'production'
      ? [new winston.transports.File({ filename: 'logs/rejections.log' })]
      : []),
  ],
});

// Extend Express Request interface to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}
