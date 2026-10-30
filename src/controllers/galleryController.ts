import { Request, Response } from 'express';
import { galleryService } from '../services/index.js';
import { 
  galleryCreateSchema, 
  galleryUpdateSchema, 
  galleryQuerySchema 
} from '../validators/index.js';
import { AppError } from '../middleware/errorHandler.js';

export const galleryController = {
  async findAll(req: Request, res: Response) {
    const query = galleryQuerySchema.parse(req.query);
    const result = await galleryService.findAll(query);
    res.json(result);
  },

  async findById(req: Request, res: Response) {
    const { id } = req.params;
    const entry = await galleryService.findById(id);
    res.json(entry);
  },

  async create(req: Request, res: Response) {
    const data = galleryCreateSchema.parse(req.body);
    const entry = await galleryService.create(data);
    res.status(201).json(entry);
  },

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const data = galleryUpdateSchema.parse(req.body);
    const entry = await galleryService.update(id, data);
    res.json(entry);
  },

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const result = await galleryService.delete(id);
    res.json(result);
  },

  async reorder(req: Request, res: Response) {
    const { entries } = req.body;
    
    if (!Array.isArray(entries)) {
      throw AppError.badRequest('entries deve ser um array');
    }
    
    for (const entry of entries) {
      if (!entry.id || typeof entry.orderIndex !== 'number') {
        throw AppError.badRequest('Cada entry deve ter id e orderIndex');
      }
    }
    
    const result = await galleryService.reorder(entries);
    res.json(result);
  },
};