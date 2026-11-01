import { Request, Response } from 'express';
import { tripService } from '../services/index.js';
import { 
  tripCreateSchema, 
  tripUpdateSchema, 
  tripQuerySchema 
} from '../validators/index.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';

export const tripController = {
  async findAll(req: Request, res: Response) {
    const query = tripQuerySchema.parse(req.query);
    const result = await tripService.findAll(query);
    res.json(result);
  },

  async findById(req: Request, res: Response) {
    const { id } = req.params;
    const trip = await tripService.findById(id);
    res.json(trip);
  },

  async create(req: AuthRequest, res: Response) {
    const data = tripCreateSchema.parse(req.body);
    // Só admin publica: não-admin cria apenas rascunho
    if (req.user?.role !== 'admin' && data.status !== 'DRAFT') {
      throw AppError.forbidden('Apenas administradores podem definir o status da viagem');
    }
    const trip = await tripService.create(data);
    res.status(201).json(trip);
  },

  async update(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const data = tripUpdateSchema.parse(req.body);
    // Só admin muda status; reenviar o status atual é permitido (o formulário sempre envia o campo)
    if (req.user?.role !== 'admin' && data.status !== undefined) {
      const current = await tripService.findById(id);
      if (data.status !== current.status) {
        throw AppError.forbidden('Apenas administradores podem alterar o status da viagem');
      }
    }
    const trip = await tripService.update(id, data);
    res.json(trip);
  },

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const result = await tripService.delete(id);
    res.json(result);
  },

  async publish(req: Request, res: Response) {
    const { id } = req.params;
    const trip = await tripService.publish(id);
    res.json(trip);
  },

  async unpublish(req: Request, res: Response) {
    const { id } = req.params;
    const trip = await tripService.unpublish(id);
    res.json(trip);
  },
};