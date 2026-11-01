import { prisma } from '../lib/prisma.js';

export const DEFAULT_WHATSAPP_KEY = 'defaultWhatsapp';

export function parseWhatsapp(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export const settingsService = {
  async getDefaultWhatsapp(): Promise<string | null> {
    const setting = await prisma.setting.findUnique({ where: { key: DEFAULT_WHATSAPP_KEY } });
    return parseWhatsapp(setting?.value);
  },

  async setDefaultWhatsapp(defaultWhatsapp: string) {
    await prisma.setting.upsert({
      where: { key: DEFAULT_WHATSAPP_KEY },
      create: { key: DEFAULT_WHATSAPP_KEY, value: JSON.stringify(defaultWhatsapp) },
      update: { value: JSON.stringify(defaultWhatsapp) },
    });
    return { defaultWhatsapp };
  },
};
