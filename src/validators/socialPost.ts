import { z } from 'zod';

// Compartilhado entre a rota legada (socialPostRoutes.ts) e a rota por
// empresa (organizationSocialPostRoutes.ts): mesmas regras de validação e
// concorrência, nunca duplicadas — só o filtro de organizationId muda.
export const socialPostId = z.string().min(1).max(128);
export const socialPostVersion = z.number().int().min(1).max(2_147_483_646);
export const socialPostVariant = z.object({
  platform: z.enum(['INSTAGRAM', 'FACEBOOK', 'TIKTOK']),
  caption: z.string().trim().max(5000),
  socialMediaId: socialPostId.nullable().optional(),
}).strict();
export const socialPostVariants = z.array(socialPostVariant).min(1).max(3)
  .refine((items) => new Set(items.map((item) => item.platform)).size === items.length, 'Cada rede deve aparecer apenas uma vez.');
export const socialPostContent = { title: z.string().trim().min(1).max(160), variants: socialPostVariants };
export const socialPostCreateSchema = z.object(socialPostContent).strict();
export const socialPostUpdateSchema = z.object({ ...socialPostContent, version: socialPostVersion }).strict();
export const socialPostRevisionSchema = z.object({ version: socialPostVersion }).strict();
export const socialPostInclude = { variants: { select: { platform: true, caption: true, socialMediaId: true }, orderBy: { platform: 'asc' as const } } };
