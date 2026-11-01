import { Request, Response } from 'express';
import { visitService } from '../services/index.js';
import { 
  visitCreateSchema, 
  visitUpdateSchema, 
  visitQuerySchema 
} from '../validators/index.js';
import { AppError } from '../middleware/errorHandler.js';

export const visitController = {
  async findAll(req: Request, res: Response) {
    const query = visitQuerySchema.parse(req.query);
    const result = await visitService.findAll(query);
    res.json(result);
  },

  async findById(req: Request, res: Response) {
    const { id } = req.params;
    const visit = await visitService.findById(id);
    res.json(visit);
  },

  async create(req: Request, res: Response) {
    const data = visitCreateSchema.parse(req.body);
    const visit = await visitService.create(data);
    res.status(201).json(visit);
  },

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const data = visitUpdateSchema.parse(req.body);
    const visit = await visitService.update(id, data);
    res.json(visit);
  },

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const result = await visitService.delete(id);
    res.json(result);
  },

  async associateWithTrip(req: Request, res: Response) {
    const { id } = req.params;
    const { tripId } = req.body;
    
    // tripId can be null to disassociate
    const visit = await visitService.associateWithTrip(id, tripId || null);
    res.json(visit);
  },
};