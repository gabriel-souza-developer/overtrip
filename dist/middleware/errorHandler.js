"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = exports.errorHandler = exports.AppError = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
class AppError extends Error {
    statusCode;
    message;
    code;
    details;
    constructor(statusCode, message, code, details) {
        super(message);
        this.statusCode = statusCode;
        this.message = message;
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, AppError.prototype);
    }
    static badRequest(message, details) {
        return new AppError(400, message, 'BAD_REQUEST', details);
    }
    static unauthorized(message = 'Não autorizado') {
        return new AppError(401, message, 'UNAUTHORIZED');
    }
    static forbidden(message = 'Acesso negado') {
        return new AppError(403, message, 'FORBIDDEN');
    }
    static notFound(message = 'Recurso não encontrado') {
        return new AppError(404, message, 'NOT_FOUND');
    }
    static conflict(message, details) {
        return new AppError(409, message, 'CONFLICT', details);
    }
    static internal(message = 'Erro interno do servidor') {
        return new AppError(500, message, 'INTERNAL_ERROR');
    }
}
exports.AppError = AppError;
const errorHandler = (err, req, res, _next) => {
    console.error('Error:', err);
    if (err instanceof zod_1.ZodError) {
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
    if (err instanceof client_1.Prisma.PrismaClientKnownRequestError) {
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
exports.errorHandler = errorHandler;
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
//# sourceMappingURL=errorHandler.js.map