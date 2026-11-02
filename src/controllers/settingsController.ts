import { Request, Response } from 'express';
import { settingsService } from '../services/settingsService.js';
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
};
