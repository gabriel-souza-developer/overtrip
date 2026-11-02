import { prisma } from '../lib/prisma.js';

export const DEFAULT_WHATSAPP_KEY = 'defaultWhatsapp';
export const TRIP_PRESENTATION_DEFAULTS_KEY = 'tripPresentationDefaults';

export interface TripPresentationDefaults {
  buttonLabel: string;
  buttonClass: 'button-dark' | 'button-rust' | 'button-light' | 'button-outline';
  priceUnit: string;
}

export const DEFAULT_TRIP_PRESENTATION: TripPresentationDefaults = {
  buttonLabel: 'Quero viajar',
  buttonClass: 'button-dark',
  priceUnit: 'por pessoa',
};

export function parseWhatsapp(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function parseTripPresentationDefaults(value: string | null | undefined): TripPresentationDefaults {
  if (!value) return { ...DEFAULT_TRIP_PRESENTATION };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_TRIP_PRESENTATION };
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.buttonLabel !== 'string' || !candidate.buttonLabel.trim() ||
      typeof candidate.priceUnit !== 'string' || !candidate.priceUnit.trim() ||
      !['button-dark', 'button-rust', 'button-light', 'button-outline'].includes(String(candidate.buttonClass))
    ) return { ...DEFAULT_TRIP_PRESENTATION };
    return {
      buttonLabel: candidate.buttonLabel.trim(),
      buttonClass: candidate.buttonClass as TripPresentationDefaults['buttonClass'],
      priceUnit: candidate.priceUnit.trim(),
    };
  } catch {
    return { ...DEFAULT_TRIP_PRESENTATION };
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

  async getTripPresentationDefaults(): Promise<TripPresentationDefaults> {
    const setting = await prisma.setting.findUnique({ where: { key: TRIP_PRESENTATION_DEFAULTS_KEY } });
    return parseTripPresentationDefaults(setting?.value);
  },

  async setTripPresentationDefaults(defaults: TripPresentationDefaults) {
    const value = JSON.stringify(defaults);
    await prisma.setting.upsert({
      where: { key: TRIP_PRESENTATION_DEFAULTS_KEY },
      create: { key: TRIP_PRESENTATION_DEFAULTS_KEY, value },
      update: { value },
    });
    return defaults;
  },
};
