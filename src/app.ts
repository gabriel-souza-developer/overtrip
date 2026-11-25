import express, { type RequestHandler } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import profileAvatarRoutes from './routes/profileAvatarRoutes.js';
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
import mediaRoutes from './routes/mediaRoutes.js';
import cspReportRoutes from './routes/cspReportRoutes.js';
import socialPostRoutes from './routes/socialPostRoutes.js';
import socialMediaRoutes from './routes/socialMediaRoutes.js';
import organizationRoutes from './routes/organizationRoutes.js';
import userManagementRoutes from './routes/userManagementRoutes.js';
import destinationRoutes from './routes/destinationRoutes.js';
import { authenticate, requireLegacyAccess } from './middleware/auth.js';

const app = express();
// A barreira também define no-store em respostas de autenticação e permissão.
const legacyGate: RequestHandler[] = [(_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, authenticate, requireLegacyAccess];

if (config.trustProxy) app.set('trust proxy', config.trustProxy);

// Rota pública do site: monta ANTES do cors global (tem CORS próprio, aberto)
app.use('/api/public', publicRoutes);

// Middleware
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
// Relatórios de CSP precisam do parser bruto e ficam antes do JSON geral.
app.use('/api/csp-report', cspReportRoutes);
app.use('/api/trips/:tripId/documents', legacyGate, documentRoutes);
// Envio de imagens: corpo bruto, montado antes do express.json.
app.use('/api/media', legacyGate, mediaRoutes);
app.use('/api/social-media', legacyGate, socialMediaRoutes);
app.use('/api/profile/avatar', profileAvatarRoutes);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', legacyGate, tripRoutes);
app.use('/api/leads', legacyGate, leadRoutes);
app.use('/api/reservations', legacyGate, reservationRoutes);
app.use('/api/social-posts', legacyGate, socialPostRoutes);
app.use('/api/system', legacyGate, systemRoutes);
app.use('/api/visits', legacyGate, visitRoutes);
app.use('/api/destinations', legacyGate, destinationRoutes);
app.use('/api/gallery', legacyGate, galleryRoutes);
app.use('/api/dashboard', legacyGate, dashboardRoutes);
app.use('/api/settings', legacyGate, settingsRoutes);
app.use('/api/users', legacyGate, userManagementRoutes);
app.use('/api/assistant-knowledge', legacyGate, assistantKnowledgeRoutes);
app.use('/api/ai', legacyGate, aiRoutes);
app.use('/api/organizations', organizationRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
