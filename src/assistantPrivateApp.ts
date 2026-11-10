import express from 'express';
import path from 'node:path';
import { authenticateAssistantService } from './services/assistantServiceAuth.js';
import { assistantCatalogService } from './services/assistantCatalog.js';
import { getAssistantKnowledge } from './services/assistantKnowledge.js';
import { toN8nTrip } from './services/assistantN8nProjection.js';
import { getN8nV2Knowledge, listN8nV2Trips } from './services/assistantN8nV2.js';

/** Aplicação separada, somente leitura; o servidor deve escutar em loopback. */
export function createAssistantPrivateApp(secret: string | undefined, options: { knowledgeFile?: string } = {}) {
  const knowledgeFile = options.knowledgeFile ?? process.env.ASSISTANT_KNOWLEDGE_FILE ?? path.resolve('knowledge.json');
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
  // Contrato v2 (fluxo v35): formato do antigo trips.json/knowledge.json.
  app.get('/n8n/v2/trips', (_req, res, next) => {
    listN8nV2Trips().then(trips => res.json(trips)).catch(next);
  });
  app.get('/n8n/v2/knowledge', (_req, res) => {
    getN8nV2Knowledge(knowledgeFile).then(data => res.json(data))
      .catch(() => res.status(503).json({ error: 'Base de conhecimento indisponível' }));
  });
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'Serviço indisponível' });
  });
  return app;
}
