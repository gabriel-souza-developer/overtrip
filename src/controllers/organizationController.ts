import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertOrganizationWriteAccess, OrganizationRequest } from '../middleware/organizationContext.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  BRAND_COLOR_CONTRAST_MESSAGE,
  BRAND_COLOR_FORMAT_MESSAGE,
  hasEnoughContrastOnWhite,
  isValidBrandColorFormat,
} from '../validators/organizationBrand.js';

// Os dois campos seguem a mesma convenção: omitido no corpo não altera o
// valor já salvo; presente (string ou null) grava a troca. Isso é o que
// permite cada formulário do painel (unidade de preço x cor da empresa)
// gravar só o que o usuário realmente editou naquela submissão, sem
// reenviar de volta um retrato antigo do outro campo — do contrário, dois
// administradores editando campos diferentes quase ao mesmo tempo
// fariam um sobrescrever silenciosamente a mudança do outro.
// defaultPriceUnit: null limpa a substituição e volta ao padrão fixo usado
// em toda viagem nova (igual ao "por pessoa" do acervo legado, que também é
// só um padrão de preenchimento, nunca lido de volta do banco em cada
// criação).
// brandColor: null limpa e volta à paleta verde fixa do painel; string
// precisa ser #RRGGBB com contraste >= 4.5:1 contra branco (é usada como
// texto e como fundo de botão com texto branco) — revalidado aqui mesmo
// quando o cliente já valida, porque o servidor nunca confia em validação
// só do lado do cliente.
const brandColorInput = z.string().trim().nullable().optional()
  .refine((value) => value == null || isValidBrandColorFormat(value), { message: BRAND_COLOR_FORMAT_MESSAGE })
  .refine((value) => value == null || !isValidBrandColorFormat(value) || hasEnoughContrastOnWhite(value), { message: BRAND_COLOR_CONTRAST_MESSAGE });
const updateSettingsSchema = z.object({
  defaultPriceUnit: z.string().trim().min(1).max(40).nullable().optional(),
  brandColor: brandColorInput,
}).strict();

export const organizationController = {
  async listMine(req: AuthRequest, res: Response) {
    if (!req.user) throw AppError.unauthorized('Não autenticado');

    const memberships = await prisma.membership.findMany({
      where: { userId: req.user.id, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      organizations: memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        niche: m.organization.niche,
        role: m.role,
      })),
    });
  },

  async getSelected(req: OrganizationRequest, res: Response) {
    if (!req.organizationContext) throw AppError.internal('Contexto de empresa ausente');

    res.json({
      organization: req.organizationContext.organization,
      role: req.organizationContext.membership.role,
    });
  },

  // Única configuração de empresa com paridade real hoje: as demais seções
  // de Configurações do painel OVERTRIP (WhatsApp, FAQ do site, base da IA)
  // são da plataforma, nunca de uma empresa, e o estilo/texto do botão de
  // nova viagem só importa quando publicada no site da OVERTRIP, o que a
  // rota de viagens por empresa nunca faz — por isso ficam fora daqui.
  async updateSettings(req: OrganizationRequest, res: Response) {
    if (!req.organizationContext) throw AppError.internal('Contexto de empresa ausente');
    const organizationId = req.organizationContext.organization.id;
    const input = updateSettingsSchema.parse(req.body);
    const organization = await prisma.$transaction(async (tx) => {
      await assertOrganizationWriteAccess(tx, organizationId, req.user!.id);
      return tx.organization.update({
        where: { id: organizationId },
        data: {
          // Ausente no corpo: não toca o padrão já salvo (mesma regra do
          // brandColor abaixo). Presente (string ou null): grava a troca.
          ...(input.defaultPriceUnit !== undefined ? { defaultPriceUnit: input.defaultPriceUnit } : {}),
          // Ausente no corpo: não toca a cor já salva. Presente (string ou
          // null): grava normalizada em minúsculas, ou limpa para null.
          ...(input.brandColor !== undefined ? { brandColor: input.brandColor === null ? null : input.brandColor.toLowerCase() } : {}),
        },
        select: { id: true, name: true, slug: true, niche: true, status: true, defaultPriceUnit: true, brandColor: true },
      });
    });
    res.json({ organization, role: req.organizationContext.membership.role });
  },
};
