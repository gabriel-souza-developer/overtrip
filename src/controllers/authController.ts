import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { loginSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from '../validators/index.js';
import { generateToken, AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { config } from '../config.js';
import { sessionCookieName } from '../lib/sessionCookie.js';
import { requestPasswordReset, resetPassword, invalidatePendingResetTokens } from '../services/passwordResetService.js';

// Mesma resposta para quem tem conta e para quem não tem: não dá para
// descobrir se um e-mail está cadastrado a partir desta rota. Frase
// condicional ("se existir... será enviado"), não afirmativa ("enviamos"):
// mesmo quando o envio à Brevo falha para uma conta existente, isto
// continua verdadeiro — nunca promete uma confirmação de entrega que não
// aconteceu.
const FORGOT_PASSWORD_GENERIC_MESSAGE = 'Se existir uma conta com este e-mail, um link para redefinir a senha será enviado em breve. Verifique sua caixa de entrada.';

// Mesma ordem de custo das senhas atuais, para evitar resposta imediata
// quando não existe usuário. O hash não corresponde a uma conta utilizável.
const DUMMY_PASSWORD_HASH = '$2a$12$4ngBzuWhF/zzihSghDPEFe4sx1p.M8UZUnPhIjGubJ5WPzqpVav/q';

const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'lax' as const,
  path: '/',
});

export const authController = {
  async login(req: Request, res: Response) {
    const { email, password } = loginSchema.parse(req.body);

    // Preserve a busca exata das contas antigas; contas novas usam e-mail
    // normalizado e aceitam também letras maiúsculas digitadas no login.
    const user = await prisma.user.findUnique({ where: { email } })
      ?? (email !== email.toLowerCase()
        ? await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
        : null);
    
    const validPassword = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    
    if (!user || !validPassword) {
      throw AppError.unauthorized('Credenciais inválidas');
    }

    const token = generateToken(user);

    res.set('Cache-Control', 'no-store');
    res.cookie(sessionCookieName(req), token, sessionCookieOptions());

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        legacyAccess: user.legacyAccess,
        mustChangePassword: user.mustChangePassword,
      },
    });
  },

  async me(req: AuthRequest, res: Response) {
    if (!req.user) {
      throw AppError.unauthorized('Não autenticado');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, legacyAccess: true, mustChangePassword: true, createdAt: true },
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

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw AppError.badRequest('Escolha uma senha diferente da senha atual.');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    const userId = req.user.id;
    const sessionVersion = req.user.sessionVersion;

    // Atômico: a troca de senha e a invalidação de qualquer token de
    // "esqueci minha senha" pendente acontecem juntas. Sem isso, um token
    // emitido antes desta troca continuaria válido depois dela.
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.user.updateMany({
        where: { id: userId, updatedAt: sessionVersion },
        data: { passwordHash: newPasswordHash, mustChangePassword: false, credentialVersion: { increment: 1 }, updatedAt: new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1)) },
      });
      if (updated.count !== 1) throw AppError.unauthorized('Sessão encerrada. Entre novamente.');
      await invalidatePendingResetTokens(tx, userId, now);
    });

    res.clearCookie(sessionCookieName(req), sessionCookieOptions());

    res.json({ success: true, message: 'Senha alterada com sucesso' });
  },

  async forgotPassword(req: Request, res: Response) {
    const { email } = forgotPasswordSchema.parse(req.body);
    res.set('Cache-Control', 'no-store');

    const outcome = await requestPasswordReset(email);

    // 'unavailable' é decidido antes de qualquer busca por conta (ver
    // passwordResetService): é seguro expor, não distingue e-mails.
    if (outcome === 'unavailable') {
      throw AppError.serviceUnavailable(
        'O serviço de e-mail está indisponível no momento. Tente novamente mais tarde.'
      );
    }

    // 'sent' e 'no_account' recebem exatamente a mesma resposta.
    res.json({ success: true, message: FORGOT_PASSWORD_GENERIC_MESSAGE });
  },

  async resetPassword(req: Request, res: Response) {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    res.set('Cache-Control', 'no-store');

    const outcome = await resetPassword(token, newPassword);

    if (outcome === 'invalid') {
      throw new AppError(400, 'Link inválido ou expirado. Solicite uma nova redefinição de senha.', 'INVALID_RESET_TOKEN');
    }

    res.json({ success: true, message: 'Senha redefinida com sucesso. Entre com sua nova senha.' });
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
    res.clearCookie(sessionCookieName(req), sessionCookieOptions());
    res.status(204).end();
  },
};
