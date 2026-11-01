import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message: string = 'Não autorizado'): AppError {
    return new AppError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message: string = 'Acesso negado'): AppError {
    return new AppError(403, message, 'FORBIDDEN');
  }

  static notFound(message: string = 'Recurso não encontrado'): AppError {
    return new AppError(404, message, 'NOT_FOUND');
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(409, message, 'CONFLICT', details);
  }

  static internal(message: string = 'Erro interno do servidor'): AppError {
    return new AppError(500, message, 'INTERNAL_ERROR');
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Error:', err);

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Dados de entrada inválidos',
      code: 'VALIDATION_ERROR',
      details: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
    return;
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: 'Registro duplicado',
        code: 'DUPLICATE_ENTRY',
        details: err.meta,
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        error: 'Registro não encontrado',
        code: 'NOT_FOUND',
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        error: 'Referência inválida',
        code: 'INVALID_REFERENCE',
        details: err.meta,
      });
      return;
    }
  }

  // Generic error
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : err.message,
    code: 'INTERNAL_ERROR',
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};