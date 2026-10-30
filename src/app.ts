import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import visitRoutes from './routes/visitRoutes.js';
import galleryRoutes from './routes/galleryRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

const app = express();

// Middleware
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Generate JSON endpoint (lazy loaded to avoid startup execution)
app.post('/api/generate-json', async (req, res, next) => {
  try {
    const { authenticate, authorize } = await import('./middleware/auth.js');
    // Apply auth middleware
    await new Promise<void>((resolve, reject) => {
      authenticate(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    authorize('admin')(req, res, async (err) => {
      if (err) return next(err);
      try {
        // Use variable to avoid TypeScript resolving path at compile time
        const generateJsonPath = '../scripts/generate-json.js';
        const { generateJson } = await import(generateJsonPath);
        await generateJson();
        res.json({ success: true, message: 'JSONs gerados com sucesso' });
      } catch (error) {
        console.error('Generate JSON error:', error);
        res.status(500).json({ error: 'Erro ao gerar JSONs' });
      }
    });
  } catch (error) {
    next(error);
  }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;