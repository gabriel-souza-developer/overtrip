import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { loginSchema, changePasswordSchema } from '../validators/index.js';
import { generateToken, AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

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

    const token = generateToken({
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
    
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: newPasswordHash },
    });

    res.json({ success: true, message: 'Senha alterada com sucesso' });
  },
};