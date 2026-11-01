import { Router, type RequestHandler, type Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import {
  AiDraftError,
  MAX_TEXT_LENGTH,
  createProviderFromEnv,
  generateTripDraft,
  type AiClient,
  type AiProvider,
} from '../services/aiTripDraft.js';

export interface AiRoutesDeps {
  auth?: RequestHandler;
  /** Devolve o cliente de IA, ou null quando não há chave. */
  getClient?: () => AiProvider | AiClient | null;
  /** Modelo escolhido (AI_MODEL). Vazio = padrão do provedor. */
  model?: () => string | undefined;
  limiter?: RequestHandler;
  log?: (message: string, data: Record<string, unknown>) => void;
}

let cachedProvider: { signature: string; provider: AiProvider | null } | null = null;

function envProvider(): AiProvider | null {
  const signature = [process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY, process.env.ANTHROPIC_API_KEY].join('|');
  if (!cachedProvider || cachedProvider.signature !== signature) {
    cachedProvider = { signature, provider: createProviderFromEnv() };
  }
  return cachedProvider.provider;
}

export function createAiRouter(deps: AiRoutesDeps = {}): Router {
  const auth = deps.auth ?? (authenticate as RequestHandler);
  const getClient = deps.getClient ?? envProvider;
  const model = deps.model ?? (() => process.env.AI_MODEL || undefined);
  const log = deps.log ?? ((message, data) => console.info(message, data));
  const limiter =
    deps.limiter ??
    createRateLimiter({
      windowMs: 60_000,
      max: 10,
      message: 'Muitos pedidos de IA em pouco tempo. Aguarde um minuto e tente de novo.',
      keyOf: (req) => (req as AuthRequest).user?.id ?? req.ip ?? 'unknown',
    });

  const router = Router();
  router.use(auth);

  router.get('/status', (_req, res) => {
    res.json({ enabled: getClient() !== null });
  });

  router.post(
    '/trip-draft',
    limiter,
    asyncHandler(async (req: AuthRequest, res: Response) => {
      const client = getClient();
      if (!client) {
        res.status(503).json({ error: 'A ajuda de IA não está ativada neste ambiente.' });
        return;
      }
      const text = (req.body as { text?: unknown } | undefined)?.text;
      if (typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ error: 'Escreva ou cole o texto da viagem.' });
        return;
      }
      if (text.length > MAX_TEXT_LENGTH) {
        res.status(413).json({ error: `O texto é grande demais. Use até ${MAX_TEXT_LENGTH} caracteres.` });
        return;
      }
      try {
        const result = await generateTripDraft(client, text.trim(), model(), (usage) =>
          log('[ai] trip-draft', { userId: req.user?.id, ...usage }),
          (info) => log('[ai] trip-draft erro', { userId: req.user?.id, ...info }),
        );
        res.json(result);
      } catch (error) {
        if (error instanceof AiDraftError) {
          res.status(error.status).json({ error: error.message });
          return;
        }
        throw error;
      }
    }),
  );

  return router;
}

export default createAiRouter();
