import { Request, Response } from 'express';
import { tripService } from '../services/index.js';
import { 
  tripCreateSchema, 
  tripUpdateSchema, 
  tripQuerySchema 
} from '../validators/index.js';
import { AppError } from '../middleware/errorHandler.js';

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

  async create(req: Request, res: Response) {
    const data = tripCreateSchema.parse(req.body);
    const trip = await tripService.create(data);
    res.status(201).json(trip);
  },

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const data = tripUpdateSchema.parse(req.body);
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