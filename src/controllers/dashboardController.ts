import { Request, Response } from 'express';
import { dashboardService } from '../services/index.js';

export const dashboardController = {
  async getStats(req: Request, res: Response) {
    const stats = await dashboardService.getStats();
    res.json(stats);
  },
};