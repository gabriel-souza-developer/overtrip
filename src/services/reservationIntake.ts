import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { toAssistantCatalogTrip } from './assistantCatalog.js';
import { publicOrganizationFilter, toSiteDate } from './publicTrips.js';
import { currentLegacyTourismFilter, legacyReservationOrganizationFilter, legacyTourismOrganizationIdForNewRecord } from './legacyTourismScope.js';

/**
 * Entrada de PEDIDOS de reserva vindos do n8n (WhatsApp).
 *
 * O que faz: registra uma solicitação na tela Reservas como Reservation
 * PENDING, origem WHATSAPP_N8N e needsReview = true. O valor total é calculado
 * no servidor a partir do preço da TRIP; nada vindo do modelo é usado como preço.
 * A solicitação não entra no Financeiro até que a equipe registre 50% recebido.
 *
 * O que NÃO faz: não confirma a vaga, não cria parcela nem registra pagamento, não
 * altera vagas (spotsLeft) e não cria interessado (Lead). A disponibilidade só
 * é lida para recusar TRIP esgotada, pelo mesmo critério do catálogo.
 *
 * Dados pessoais aceitos: nome e telefone do comprador. CPF, documento,
 * e-mail, contato de emergência, dados por passageiro, texto livre da conversa
 * e identificadores do WhatsApp são recusados pelo esquema estrito. Nada
 * pessoal é devolvido nem registrado em log.
 */

export const INTAKE_MAX_SEATS = 10;
export const INTAKE_DEFAULT_RETENTION_DAYS = 90;
export const INTAKE_SOURCE = 'WHATSAPP_N8N';

// Formato fixo: prefixo curto + SHA-256 em hexadecimal, calculado pelo n8n a
// partir do ID da mensagem. Telefone, nome ou JID não cabem nesse formato.
const idempotencyKeySchema = z.string().regex(/^[a-z][a-z0-9]{1,7}-[a-f0-9]{64}$/);

const nameSchema = z.string()
  .transform(value => value.normalize('NFC').replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(2).max(120)
    .regex(/^[\p{L}\p{M}' .-]+$/u)
    .refine(value => (value.match(/\p{L}/gu) ?? []).length >= 2));

export const intakeBodySchema = z.object({
  tripTitle: z.string().trim().min(3).max(200),
  // Mesmo dia civil (America/Sao_Paulo) que o feed /n8n/v2/trips mostra em startDateISO.
  tripStartDate: z.iso.date(),
  // Comprador/responsável pelo pedido; passageiros são informados depois, por canal seguro.
  name: nameSchema,
  phone: z.string().max(32),
  seats: z.number().int().min(1).max(INTAKE_MAX_SEATS),
  // A pessoa confirmou o pedido na conversa e o fluxo mostrou o aviso de uso dos dados.
  customerConfirmed: z.literal(true),
  privacyNoticeShown: z.literal(true),
}).strict();

export type IntakeBody = z.infer<typeof intakeBodySchema>;

/**
 * Telefone brasileiro em formato canônico +55DDNNNNNNNNN (celular) ou
 * +55DDNNNNNNNN (fixo). Aceita prefixos +55, 55, 0055 e 0 de discagem, e o
 * formato do WhatsApp sem o nono dígito (celular de 8 dígitos começando por
 * 6–9 recebe o 9). Números estrangeiros ou inválidos retornam null.
 */
export function normalizeBrazilianPhone(raw: string): string | null {
  if (!/^\s*\+?[\d\s().-]{8,32}$/.test(raw)) return null;
  const international = raw.trim().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (international) {
    if (!digits.startsWith('55')) return null;
    digits = digits.slice(2);
  } else {
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
      if (!digits.startsWith('55')) return null;
      digits = digits.slice(2);
    } else if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
      digits = digits.slice(2);
    }
  }
  // "0" de discagem de longa distância antes do DDD.
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = digits.slice(0, 2);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  let subscriber = digits.slice(2);
  if (subscriber.length === 8 && /^[6-9]/.test(subscriber)) subscriber = `9${subscriber}`;
  if (subscriber.length === 9 && !subscriber.startsWith('9')) return null;
  if (subscriber.length === 8 && !/^[2-5]/.test(subscriber)) return null;
  return `+55${ddd}${subscriber}`;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function payloadDigest(salt: string, body: IntakeBody, phone: string) {
  const canonical = JSON.stringify([body.tripTitle, body.tripStartDate, body.name, phone, body.seats]);
  return sha256(`${salt}:${canonical}`);
}

function sameDigest(a: string, b: string) {
  const left = Buffer.from(a, 'hex'); const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export type IntakeErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_PHONE'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'TRIP_NOT_FOUND'
  | 'TRIP_AMBIGUOUS'
  | 'TRIP_SOLD_OUT'
  | 'TRIP_OUT_OF_SCOPE'
  | 'IDEMPOTENCY_KEY_REUSED';

export class IntakeError extends Error {
  constructor(public readonly status: number, public readonly code: IntakeErrorCode, public readonly fields: string[] = []) {
    super(code);
  }
}

export type IntakeOutcome = 'CREATED' | 'DUPLICATE';

export interface IntakeResult {
  httpStatus: 200 | 201;
  body: ReturnType<typeof successBody>;
}

const HANDOFF_MESSAGE = (title: string) =>
  `Recebemos sua solicitação para ${title}. A equipe OVERTRIP vai confirmar o valor e orientar o pagamento do sinal de 50%. A vaga só será confirmada depois que o recebimento for conferido. Seus dados de participantes serão coletados por canal seguro.`;

function successBody(requestId: string, outcome: IntakeOutcome, replayed: boolean, tripTitle: string) {
  return {
    requestId,
    status: 'PENDING_HUMAN' as const,
    recordedAs: 'RESERVATION_REQUEST_PENDING_DEPOSIT' as const,
    outcome,
    replayed,
    reservationConfirmed: false as const,
    paymentRegistered: false as const,
    seatsHeld: false as const,
    handoff: { required: true as const, reason: 'RESERVATION_REQUEST' as const, customerMessage: HANDOFF_MESSAGE(tripTitle) },
  };
}

export function errorBody(code: string, fields: string[] = []) {
  return {
    error: code,
    ...(fields.length ? { fields } : {}),
    reservationConfirmed: false as const,
    paymentRegistered: false as const,
    seatsHeld: false as const,
    handoff: {
      required: true as const,
      reason: 'INTAKE_REJECTED' as const,
      customerMessage: 'Vou chamar uma pessoa da equipe OVERTRIP para continuar seu atendimento por aqui.',
    },
  };
}

/** Só nomes de campos, nunca valores (podem conter dados pessoais). */
export function parseIntakeBody(input: unknown): IntakeBody {
  const parsed = intakeBodySchema.safeParse(input);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map(issue => issue.path.join('.') || '(corpo)'))].slice(0, 10);
    throw new IntakeError(400, 'VALIDATION_FAILED', fields);
  }
  return parsed.data;
}

export function parseIdempotencyKey(value: unknown): string {
  const parsed = idempotencyKeySchema.safeParse(value);
  if (!parsed.success) throw new IntakeError(400, 'INVALID_IDEMPOTENCY_KEY', ['Idempotency-Key']);
  return parsed.data;
}

const titleKey = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');

function retentionDays() {
  const raw = process.env.RESERVATION_INTAKE_RETENTION_DAYS;
  const value = raw ? Number(raw) : INTAKE_DEFAULT_RETENTION_DAYS;
  return Number.isInteger(value) && value >= 7 && value <= 730 ? value : INTAKE_DEFAULT_RETENTION_DAYS;
}

type Tx = Prisma.TransactionClient;

// Campos explícitos: só o que o catálogo usa, mais id e organizationId.
const tripSelect = {
  id: true, organizationId: true, title: true, city: true, region: true, startDateISO: true, endDateISO: true,
  departureTime: true, returnTime: true, scheduleTBD: true, meetingCity: true, meetingPoint: true, meetingTBD: true,
  priceValue: true, priceUnit: true, free: true, spotsLeft: true, description: true, includes: true,
  itinerary: true, importantInfo: true, media: true, status: true,
} satisfies Prisma.TripSelect;

/**
 * Resolve no MESMO escopo do feed /n8n/v2/trips (para que ambiguidade seja
 * vista como o fluxo a vê) e só então exige o escopo da operação legada, onde
 * a tela Reservas mostra o pedido.
 */
async function resolveTrip(tx: Tx, body: IntakeBody, now: Date) {
  const candidates = await tx.trip.findMany({
    where: { status: 'OPEN', ...publicOrganizationFilter(config.publicSiteOrganizationIds) },
    select: tripSelect,
  });
  const wanted = titleKey(body.tripTitle);
  const sameTitleAndDay = candidates.filter(trip => titleKey(trip.title) === wanted
    && toSiteDate(trip.startDateISO).slice(0, 10) === body.tripStartDate);
  // Ambiguidade conta só entre as que o feed oferece (as que o fluxo vê).
  const offered = sameTitleAndDay.filter(trip => toAssistantCatalogTrip(trip, now) !== null);
  if (offered.length > 1) throw new IntakeError(409, 'TRIP_AMBIGUOUS');
  const trip = offered[0];
  if (!trip) {
    if (sameTitleAndDay.some(row => row.spotsLeft !== null && row.spotsLeft <= 0)) throw new IntakeError(409, 'TRIP_SOLD_OUT');
    throw new IntakeError(404, 'TRIP_NOT_FOUND');
  }
  const inScope = await tx.trip.findFirst({ where: { id: trip.id, ...currentLegacyTourismFilter() }, select: { id: true } });
  if (!inScope) throw new IntakeError(409, 'TRIP_OUT_OF_SCOPE');
  return trip;
}

const perPerson = (unit: string | null | undefined) => (unit ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR') === 'por pessoa';

/**
 * Valor do pedido, sempre a partir da TRIP: preço × lugares SOMENTE quando a
 * unidade é "por pessoa". Outras unidades (por casal, por carro…) gravam 0 e a
 * nota pede que a equipe defina o valor; nunca adivinhamos a conversão.
 */
export function derivedTotalCents(trip: { free: boolean; priceValue: number | null; priceUnit?: string | null }, seats: number): { totalCents: number; priced: boolean } {
  if (trip.free) return { totalCents: 0, priced: true };
  if (!perPerson(trip.priceUnit)) return { totalCents: 0, priced: false };
  const unit = Math.round((trip.priceValue ?? 0) * 100);
  return { totalCents: Math.min(Math.max(unit, 0) * seats, 100_000_000), priced: true };
}

async function replay(tx: Tx, keyHash: string, body: IntakeBody, phone: string): Promise<IntakeResult | null> {
  const existing = await tx.reservationIntakeRequest.findUnique({
    where: { idempotencyKeyHash: keyHash },
    include: { trip: { select: { title: true } } },
  });
  if (!existing) return null;
  if (!sameDigest(existing.payloadHash, payloadDigest(existing.payloadSalt, body, phone))) {
    throw new IntakeError(409, 'IDEMPOTENCY_KEY_REUSED');
  }
  return { httpStatus: 200, body: successBody(existing.id, existing.outcome as IntakeOutcome, true, existing.trip.title) };
}

const DUPLICATE_SCAN_PAGE = 500;

/**
 * Percorre TODAS as reservas não canceladas da TRIP, em páginas por cursor
 * (id), dentro da mesma transação: sem teto arbitrário e sem carregar tudo de
 * uma vez. Telefones do painel podem estar em qualquer formato, por isso a
 * comparação é feita após normalização, fora do SQL.
 */
async function findSamePhoneReservation(tx: Tx, tripId: string, phone: string) {
  const where: Prisma.ReservationWhereInput = {
    tripId, status: { not: 'CANCELLED' }, customerPhone: { not: null },
    ...legacyReservationOrganizationFilter(config.legacyTourismOrganizationId),
  };
  let cursor: string | undefined;
  for (;;) {
    const page = await tx.reservation.findMany({
      where, select: { id: true, customerPhone: true }, orderBy: { id: 'asc' }, take: DUPLICATE_SCAN_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const match = page.find(row => row.customerPhone && normalizeBrazilianPhone(row.customerPhone) === phone);
    if (match) return match;
    if (page.length < DUPLICATE_SCAN_PAGE) return null;
    cursor = page[page.length - 1].id;
  }
}

const dayLabel = (now: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);

async function registerInTransaction(tx: Tx, keyHash: string, body: IntakeBody, phone: string, now: Date): Promise<IntakeResult> {
  const replayed = await replay(tx, keyHash, body, phone);
  if (replayed) return replayed;

  const trip = await resolveTrip(tx, body, now);

  // Duplicado = reserva não cancelada da mesma TRIP com o mesmo telefone
  // (criada pelo n8n ou pelo painel). Não cria outra e não altera a existente.
  const existing = await findSamePhoneReservation(tx, trip.id, phone);

  let reservationId: string;
  let outcome: IntakeOutcome;
  if (existing) {
    reservationId = existing.id;
    outcome = 'DUPLICATE';
  } else {
    const price = derivedTotalCents(trip, body.seats);
    const created = await tx.reservation.create({
      data: {
        tripId: trip.id,
        organizationId: legacyTourismOrganizationIdForNewRecord(),
        customerName: body.name,
        customerPhone: phone,
        seats: body.seats,
        totalCents: price.totalCents,
        status: 'PENDING',
        source: INTAKE_SOURCE,
        needsReview: true,
        notes: `Pedido recebido pelo WhatsApp (n8n) em ${dayLabel(now)}. Intenção de reserva: vagas, valor e pagamento ainda não confirmados. Dados dos participantes a coletar por canal seguro.${price.priced ? '' : ' Valor não calculado: o preço da TRIP não é por pessoa; defina o total antes de revisar.'}`,
      },
      select: { id: true },
    });
    reservationId = created.id;
    outcome = 'CREATED';
  }

  const salt = randomBytes(16).toString('hex');
  const request = await tx.reservationIntakeRequest.create({
    data: {
      organizationId: legacyTourismOrganizationIdForNewRecord(),
      idempotencyKeyHash: keyHash,
      payloadSalt: salt,
      payloadHash: payloadDigest(salt, body, phone),
      tripId: trip.id, reservationId, seats: body.seats, outcome,
      expiresAt: new Date(now.getTime() + retentionDays() * 86_400_000),
    },
    select: { id: true },
  });
  return { httpStatus: outcome === 'CREATED' ? 201 : 200, body: successBody(request.id, outcome, false, trip.title) };
}

// SQLite serializa escritas: uma transação que leu um estado desatualizado
// falha com conflito/banco ocupado em vez de gravar duplicado. Repetimos a
// transação inteira algumas vezes; na repetição, ela vê o registro já gravado.
function isRetryable(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2028: transação interativa expirou esperando o lock; P1008: tempo esgotado.
    return ['P2002', 'P2034', 'P2028', 'P1008'].includes(error.code) || /busy|locked/i.test(error.message);
  }
  return error instanceof Prisma.PrismaClientUnknownRequestError && /busy|locked/i.test(error.message);
}

export async function registerReservationIntake(idempotencyKey: string, body: IntakeBody, now = new Date()): Promise<IntakeResult> {
  const phone = normalizeBrazilianPhone(body.phone);
  if (!phone) throw new IntakeError(422, 'INVALID_PHONE', ['phone']);
  const keyHash = sha256(`reservation-intake:v1:${idempotencyKey}`);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(tx => registerInTransaction(tx, keyHash, body, phone, now), { maxWait: 5_000, timeout: 15_000 });
    } catch (error) {
      if (attempt >= 4 || !isRetryable(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * attempt + Math.floor(Math.random() * 50)));
    }
  }
}

/** Apaga metadados vencidos. As reservas seguem a gestão da equipe. */
export async function purgeExpiredReservationIntake(now = new Date()): Promise<number> {
  const result = await prisma.reservationIntakeRequest.deleteMany({ where: { expiresAt: { lte: now } } });
  return result.count;
}
