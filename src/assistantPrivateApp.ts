import express from 'express';
import { authenticateAssistantService } from './services/assistantServiceAuth.js';
import { assistantCatalogService } from './services/assistantCatalog.js';
import { getAssistantKnowledge } from './services/assistantKnowledge.js';
import { toN8nTrip } from './services/assistantN8nProjection.js';

/** Aplicação separada, somente leitura; o servidor deve escutar em loopback. */
export function createAssistantPrivateApp(secret: string | undefined) {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const headers = req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'authorization');
    if (headers.length !== 1 || !authenticateAssistantService(secret, req.headers.authorization)) {
      res.status(401).json({ error: 'Não autorizado' }); return;
    }
    next();
  });
  app.get('/catalog', (_req, res, next) => {
    assistantCatalogService.list().then(trips => res.json({ trips })).catch(next);
  });
  app.get('/knowledge', (_req, res, next) => {
    getAssistantKnowledge().then(result => res.json(result ? { version: result.version, entries: result.entries } : null)).catch(next);
  });
  app.get('/n8n/trips', (_req, res, next) => {
    assistantCatalogService.list().then(trips => res.json(trips.map(toN8nTrip))).catch(next);
  });
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'Serviço indisponível' });
  });
  return app;
}
