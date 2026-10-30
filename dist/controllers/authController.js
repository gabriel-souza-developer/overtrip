"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const prisma_js_1 = require("../lib/prisma.js");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const index_js_1 = require("../validators/index.js");
const auth_js_1 = require("../middleware/auth.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
exports.authController = {
    async login(req, res) {
        const { email, password } = index_js_1.loginSchema.parse(req.body);
        const user = await prisma_js_1.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw errorHandler_js_1.AppError.unauthorized('Credenciais inválidas');
        }
        const validPassword = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!validPassword) {
            throw errorHandler_js_1.AppError.unauthorized('Credenciais inválidas');
        }
        const token = (0, auth_js_1.generateToken)({
            id: user.id,
            email: user.email,
            role: user.role,
        });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
        });
    },
    async me(req, res) {
        if (!req.user) {
            throw errorHandler_js_1.AppError.unauthorized('Não autenticado');
        }
        const user = await prisma_js_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, email: true, name: true, role: true, createdAt: true },
        });
        if (!user) {
            throw errorHandler_js_1.AppError.unauthorized('Usuário não encontrado');
        }
        res.json(user);
    },
    async changePassword(req, res) {
        if (!req.user) {
            throw errorHandler_js_1.AppError.unauthorized('Não autenticado');
        }
        const { currentPassword, newPassword } = index_js_1.changePasswordSchema.parse(req.body);
        const user = await prisma_js_1.prisma.user.findUnique({
            where: { id: req.user.id },
        });
        if (!user) {
            throw errorHandler_js_1.AppError.unauthorized('Usuário não encontrado');
        }
        const validPassword = await bcryptjs_1.default.compare(currentPassword, user.passwordHash);
        if (!validPassword) {
            throw errorHandler_js_1.AppError.unauthorized('Senha atual incorreta');
        }
        const newPasswordHash = await bcryptjs_1.default.hash(newPassword, 12);
        await prisma_js_1.prisma.user.update({
            where: { id: req.user.id },
            data: { passwordHash: newPasswordHash },
        });
        res.json({ success: true, message: 'Senha alterada com sucesso' });
    },
};
//# sourceMappingURL=authController.js.map