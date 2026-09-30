import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  logger.error(`[ErrorHandler] ${req.method} ${req.originalUrl}: ${message}`, err);

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? message : undefined,
  });
}
