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

const isUnexpectedError = (err: Error): boolean =>
  !(err instanceof AppError) &&
  !(err instanceof ZodError) &&
  !err.name.startsWith('PrismaClient') &&
  (err as Error & { type?: unknown }).type === undefined;

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Erros de validação e do Prisma podem conter dados pessoais da requisição.
  // Registre apenas metadados mínimos, sem corpo, parâmetros ou valores.
  console.error('Erro ao processar requisição', {
    name: err instanceof Prisma.PrismaClientKnownRequestError ? 'PrismaClientKnownRequestError' : err instanceof ZodError ? 'ZodError' : err instanceof AppError ? 'AppError' : 'Error',
    code: err instanceof Prisma.PrismaClientKnownRequestError ? err.code : err instanceof AppError ? err.code : undefined,
    // Só erros inesperados levam stack. Prisma (argumentos da consulta) e
    // body-parser (trecho do corpo) ficam de fora porque a mensagem pode ter dados pessoais.
    stack: isUnexpectedError(err) ? err.stack : undefined,
  });

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Dados de entrada inválidos',
      code: 'VALIDATION_ERROR',
      details: err.issues.map(e => ({
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

  // express.raw/json usam body-parser, cujo erro de limite não é AppError.
  if ((err as Error & { type?: string; status?: number }).type === 'entity.too.large') {
    res.status(413).json({
      error: 'Arquivo grande demais para esta solicitação',
      code: 'PAYLOAD_TOO_LARGE',
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
