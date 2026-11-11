import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { loginSchema, changePasswordSchema } from '../validators/index.js';
import { generateToken, AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { config } from '../config.js';

const sessionCookieName = () => config.nodeEnv === 'production'
  ? '__Host-overtrip_session'
  : 'overtrip_session';

const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'lax' as const,
  path: '/',
});

export const authController = {
  async login(req: Request, res: Response) {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      throw AppError.unauthorized('Credenciais inválidas');
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!validPassword) {
      throw AppError.unauthorized('Credenciais inválidas');
    }

    const token = generateToken(user);

    res.set('Cache-Control', 'no-store');
    res.cookie(sessionCookieName(), token, sessionCookieOptions());

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  },

  async me(req: AuthRequest, res: Response) {
    if (!req.user) {
      throw AppError.unauthorized('Não autenticado');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    if (!user) {
      throw AppError.unauthorized('Usuário não encontrado');
    }

    res.json(user);
  },

  async changePassword(req: AuthRequest, res: Response) {
    if (!req.user) {
      throw AppError.unauthorized('Não autenticado');
    }

    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      throw AppError.unauthorized('Usuário não encontrado');
    }

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    
    if (!validPassword) {
      throw AppError.unauthorized('Senha atual incorreta');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    
    const updated = await prisma.user.updateMany({
      where: { id: req.user.id, updatedAt: req.user.sessionVersion },
      data: { passwordHash: newPasswordHash, updatedAt: new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1)) },
    });
    if (updated.count !== 1) throw AppError.unauthorized('Sessão encerrada. Entre novamente.');

    res.clearCookie(sessionCookieName(), sessionCookieOptions());

    res.json({ success: true, message: 'Senha alterada com sucesso' });
  },

  async logout(req: AuthRequest, res: Response) {
    // O contador persiste no próprio User; sair encerra todas as sessões da conta.
    // A condição evita que uma requisição antiga revogue uma sessão mais recente.
    if (req.user) {
      await prisma.user.updateMany({
        where: { id: req.user.id, updatedAt: req.user.sessionVersion },
        data: { updatedAt: new Date(Math.max(Date.now(), req.user.sessionVersion.getTime() + 1)) },
      });
    }
    res.clearCookie(sessionCookieName(), sessionCookieOptions());
    res.status(204).end();
  },
};
