import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import organizationRoutes from './routes/organizationRoutes.js';
import lodgingRoutes from './routes/lodgingRoutes.js';

// Este processo deve usar banco, domínio e segredo de sessão próprios.
const app = express();
app.locals.sessionNamespace = 'platform';
if (config.trustProxy) app.set('trust proxy', config.trustProxy);
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '64kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/lodging', lodgingRoutes);
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use(errorHandler);
export { app as platformApp };
export default app;
