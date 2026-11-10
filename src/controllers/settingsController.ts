import { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { settingsService } from '../services/settingsService.js';
import { publicFaqService, publicFaqEntriesSchema } from '../services/publicFaq.js';
import { defaultWhatsappSchema, tripPresentationDefaultsSchema } from '../validators/index.js';

export const settingsController = {
  async getDefaultWhatsapp(_req: Request, res: Response) {
    res.json({ defaultWhatsapp: await settingsService.getDefaultWhatsapp() });
  },

  async updateDefaultWhatsapp(req: Request, res: Response) {
    const { defaultWhatsapp } = defaultWhatsappSchema.parse(req.body);
    res.json(await settingsService.setDefaultWhatsapp(defaultWhatsapp));
  },

  async getTripPresentationDefaults(_req: Request, res: Response) {
    res.json(await settingsService.getTripPresentationDefaults());
  },

  async updateTripPresentationDefaults(req: Request, res: Response) {
    const defaults = tripPresentationDefaultsSchema.parse(req.body);
    res.json(await settingsService.setTripPresentationDefaults(defaults));
  },

  async getPublicFaq(_req: AuthRequest, res: Response) {
    res.set('Cache-Control', 'no-store');
    res.json(await publicFaqService.get());
  },

  async publishPublicFaq(req: AuthRequest, res: Response) {
    const { expectedVersion, entries } = z.object({
      expectedVersion: z.number().int().nonnegative(),
      entries: publicFaqEntriesSchema,
    }).strict().parse(req.body);
    res.json(await publicFaqService.publish(req.user!.id, entries, expectedVersion));
  },
};
