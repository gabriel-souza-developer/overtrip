import express from 'express';
import { authenticateAssistantService } from './services/assistantServiceAuth.js';
import { errorBody, IntakeError, parseIdempotencyKey, parseIntakeBody, registerReservationIntake } from './services/reservationIntake.js';

/**
 * Serviço privado de ESCRITA mínima para o n8n: registra pedidos de reserva
 * como reservas PENDENTES a revisar (sem confirmação, pagamento ou vagas). Processo e credencial separados do serviço
 * de leitura (assistantPrivateApp): o token de leitura nunca escreve e este
 * token não lê catálogo/FAQ. Deve escutar só em loopback.
 */
export function createReservationIntakeApp(secret: string | undefined, options: { rateLimitMax?: number; readSecret?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Credencial igual à de leitura invalidaria a separação: o serviço recusa tudo.
  const usable = Boolean(secret) && secret!.toLowerCase() !== options.readSecret?.toLowerCase();

  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const authHeaders = req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'authorization');
    if (!usable || authHeaders.length !== 1 || !authenticateAssistantService(secret, req.headers.authorization)) {
      res.status(401).json({ error: 'UNAUTHORIZED' }); return;
    }
    next();
  });
  // Teto por processo (o n8n é o único cliente); protege contra laço no fluxo.
  const max = options.rateLimitMax ?? 60;
  let windowStart = Date.now(); let hits = 0;
  app.use((_req, res, next) => {
    const now = Date.now();
    if (now - windowStart >= 60_000) { windowStart = now; hits = 0; }
    hits += 1;
    if (hits > max) {
      res.setHeader('Retry-After', String(Math.ceil((windowStart + 60_000 - now) / 1000)));
      res.status(429).json(errorBody('RATE_LIMITED')); return;
    }
    next();
  });

  app.post('/n8n/v1/reservation-requests', (req, res, next) => {
    if (!req.is('application/json')) { res.status(415).json(errorBody('UNSUPPORTED_MEDIA_TYPE')); return; }
    next();
  }, express.json({ limit: '4kb', strict: true }), (req, res, next) => {
    const keyHeaders = req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'idempotency-key');
    Promise.resolve()
      .then(() => {
        if (keyHeaders.length !== 1) throw new IntakeError(400, 'INVALID_IDEMPOTENCY_KEY', ['Idempotency-Key']);
        const key = parseIdempotencyKey(req.get('idempotency-key'));
        return registerReservationIntake(key, parseIntakeBody(req.body));
      })
      .then(result => { res.status(result.httpStatus).json(result.body); })
      .catch(next);
  });

  app.use((_req, res) => { res.status(404).json(errorBody('NOT_FOUND')); });
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof IntakeError) { res.status(err.status).json(errorBody(err.code, err.fields)); return; }
    const type = (err as { type?: string } | null)?.type;
    if (type === 'entity.too.large') { res.status(413).json(errorBody('PAYLOAD_TOO_LARGE')); return; }
    if (type === 'entity.parse.failed') { res.status(400).json(errorBody('INVALID_JSON')); return; }
    // Demais erros do leitor de corpo (charset, codificação, requisição abortada).
    const status = (err as { status?: number; statusCode?: number } | null)?.status ?? (err as { statusCode?: number } | null)?.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) { res.status(status).json(errorBody('INVALID_REQUEST_BODY')); return; }
    // Sem detalhes: a mensagem pode carregar valores da requisição.
    console.error('Falha ao registrar solicitação de reserva do n8n.');
    res.status(503).json(errorBody('SERVICE_UNAVAILABLE'));
  });
  return app;
}
