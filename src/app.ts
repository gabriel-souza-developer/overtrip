import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import visitRoutes from './routes/visitRoutes.js';
import galleryRoutes from './routes/galleryRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import assistantKnowledgeRoutes from './routes/assistantKnowledgeRoutes.js';

import documentRoutes from './routes/documentRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import reservationRoutes from './routes/reservationRoutes.js';
import systemRoutes from './routes/systemRoutes.js';

const app = express();

if (config.trustProxy) app.set('trust proxy', config.trustProxy);

// Rota pública do site: monta ANTES do cors global (tem CORS próprio, aberto)
app.use('/api/public', publicRoutes);

// Middleware
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use('/api/trips/:tripId/documents', documentRoutes);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/assistant-knowledge', assistantKnowledgeRoutes);
app.use('/api/ai', aiRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
