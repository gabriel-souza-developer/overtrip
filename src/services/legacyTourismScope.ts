import { Prisma } from '@prisma/client';
import { config } from '../config.js';

/** Qualquer cliente Prisma capaz de `$queryRaw` — o client padrão ou um `tx` de `$transaction`. */
type ReservationQueryClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * Escopo da operação legada (painel clássico /api/trips, /api/leads,
 * /api/reservations, documentos por tripId, dashboard e associações de
 * visitas/galeria): por padrão só registros sem organização (dado legado,
 * organizationId null). Se LEGACY_TOURISM_ORGANIZATION_ID estiver configurado
 * (um único ID, após aplicar o backfill), o escopo passa a incluir também
 * essa organização específica — nunca todas. Independente de
 * PUBLIC_SITE_ORGANIZATION_IDS (autorização do site/assistente público, não
 * da operação). O formato do filtro (organizationId null, ou null OU um ID
 * exato) é o mesmo para Trip/Lead/Reservation; cada wrapper só fixa o tipo de
 * retorno para o `where` do Prisma correspondente.
 */
function organizationScopeFilter(legacyOrganizationId: string | null): { organizationId: null } | { OR: [{ organizationId: null }, { organizationId: string }] } {
  if (!legacyOrganizationId) return { organizationId: null };
  return { OR: [{ organizationId: null }, { organizationId: legacyOrganizationId }] };
}

/** Função pura (recebe o ID em vez de ler `config` direto) para ser testável sem variável de ambiente. */
export function legacyTourismOrganizationFilter(legacyOrganizationId: string | null): Prisma.TripWhereInput {
  return organizationScopeFilter(legacyOrganizationId);
}

export function legacyLeadOrganizationFilter(legacyOrganizationId: string | null): Prisma.LeadWhereInput {
  return organizationScopeFilter(legacyOrganizationId);
}

export function legacyReservationOrganizationFilter(legacyOrganizationId: string | null): Prisma.ReservationWhereInput {
  return organizationScopeFilter(legacyOrganizationId);
}

export function legacyVisitOrganizationFilter(legacyOrganizationId: string | null): Prisma.VisitWhereInput {
  return organizationScopeFilter(legacyOrganizationId);
}

export function legacyDestinationOrganizationFilter(legacyOrganizationId: string | null): Prisma.DestinationWhereInput {
  return organizationScopeFilter(legacyOrganizationId);
}

export function currentLegacyDestinationFilter(): Prisma.DestinationWhereInput {
  return legacyDestinationOrganizationFilter(config.legacyTourismOrganizationId);
}

export function legacyGalleryOrganizationFilter(legacyOrganizationId: string | null): Prisma.GalleryEntryWhereInput {
  return organizationScopeFilter(legacyOrganizationId);
}

/**
 * MediaAsset não tem relação de banco com Trip/Visit/GalleryEntry (é
 * referenciado por caminho dentro de campos JSON, não por FK), então não há
 * "consistência de relação" a checar aqui — só o escopo do próprio registro,
 * igual ao de Trip. Usado na deduplicação por sha256 do envio (POST
 * /api/media): sem este filtro, um envio idêntico de outra empresa reaproveitaria
 * o arquivo dela, nunca criando o registro/arquivo próprio do operador.
 */
export function legacyMediaOrganizationFilter(legacyOrganizationId: string | null): Prisma.MediaAssetWhereInput {
  return organizationScopeFilter(legacyOrganizationId);
}

export function currentLegacyMediaFilter(): Prisma.MediaAssetWhereInput {
  return legacyMediaOrganizationFilter(config.legacyTourismOrganizationId);
}

/** Filtros com o valor configurado atualmente (lidos a cada chamada, nunca em cache). */
export function currentLegacyTourismFilter(): Prisma.TripWhereInput {
  return legacyTourismOrganizationFilter(config.legacyTourismOrganizationId);
}

/** organizationId que um registro NOVO (viagem, interessado, reserva, visita ou memória da galeria) criado pela operação legada deve receber. */
export function legacyTourismOrganizationIdForNewRecord(): string | null {
  return config.legacyTourismOrganizationId;
}

/**
 * O schema permite FK cruzada: um Lead/Reservation com organizationId no
 * escopo legado pode ainda apontar (tripId/leadId) para um registro de OUTRA
 * organização — dado inconsistente anterior a este escopo, ou produzido fora
 * da API (backfill, edição direta no banco). Estes filtros, além de exigir
 * que o próprio registro esteja no escopo, exigem que toda relação presente
 * (tripId/leadId são opcionais em Lead e leadId em Reservation; tripId de
 * Reservation é obrigatório) também esteja no escopo — caso contrário o
 * registro é tratado como inacessível (nunca parcialmente exposto: a viagem
 * ou o interessado estrangeiro nunca aparece, nem seu ID nem seu título).
 * Usar em toda leitura/mutação de leads, eventos, reservas e parcelas.
 */
export function legacyLeadFilterWithConsistentTrip(legacyOrganizationId: string | null): Prisma.LeadWhereInput {
  const ownScope = legacyLeadOrganizationFilter(legacyOrganizationId);
  const tripScope = legacyTourismOrganizationFilter(legacyOrganizationId);
  return { AND: [ownScope, { OR: [{ tripId: null }, { trip: { is: tripScope } }] }] };
}

export function currentLegacyLeadFilterWithConsistentTrip(): Prisma.LeadWhereInput {
  return legacyLeadFilterWithConsistentTrip(config.legacyTourismOrganizationId);
}

/**
 * Mesma lógica acima, para visitas: o próprio registro e, se houver viagem
 * vinculada, a viagem também precisam estar no escopo. Visita sem viagem
 * (tripId null) continua permitida.
 */
export function legacyVisitFilterWithConsistentTrip(legacyOrganizationId: string | null): Prisma.VisitWhereInput {
  const ownScope = legacyVisitOrganizationFilter(legacyOrganizationId);
  const tripScope = legacyTourismOrganizationFilter(legacyOrganizationId);
  return { AND: [ownScope, { OR: [{ tripId: null }, { trip: { is: tripScope } }] }] };
}

export function currentLegacyVisitFilterWithConsistentTrip(): Prisma.VisitWhereInput {
  return legacyVisitFilterWithConsistentTrip(config.legacyTourismOrganizationId);
}

/**
 * Para memórias da galeria: o próprio registro e, se houver, a viagem e a
 * visita vinculadas (e a viagem da própria visita) precisam estar no escopo.
 * Memória sem viagem e/ou sem visita continua permitida.
 */
export function legacyGalleryFilterWithConsistentRelations(legacyOrganizationId: string | null): Prisma.GalleryEntryWhereInput {
  const ownScope = legacyGalleryOrganizationFilter(legacyOrganizationId);
  const tripScope = legacyTourismOrganizationFilter(legacyOrganizationId);
  const visitScope = legacyVisitFilterWithConsistentTrip(legacyOrganizationId);
  return {
    AND: [
      ownScope,
      { OR: [{ tripId: null }, { trip: { is: tripScope } }] },
      { OR: [{ visitId: null }, { visit: { is: visitScope } }] },
    ],
  };
}

export function currentLegacyGalleryFilterWithConsistentRelations(): Prisma.GalleryEntryWhereInput {
  return legacyGalleryFilterWithConsistentRelations(config.legacyTourismOrganizationId);
}

/**
 * Prisma não compara duas colunas de tabelas relacionadas entre si num único
 * `where` (só compara uma coluna a um valor fixo), então a consistência
 * transitiva reserva.tripId == lead.tripId (quando o lead tem viagem) precisa
 * de SQL próprio. Uma versão anterior resolvia isso buscando em memória os
 * IDs de TODAS as reservas (de todas as empresas) que passavam essa checagem
 * e reinjetando a lista num `id IN (...)`: cresce com o banco inteiro e pode
 * superar o limite de parâmetros do SQLite/Prisma numa única consulta. Em
 * vez disso, a checagem roda inteiramente dentro do SQLite via EXISTS/JOIN
 * (abaixo): nenhum ID é materializado na aplicação além do necessário.
 *
 * SQL estático (identificadores de tabela/coluna são literais fixos no
 * código, nunca derivados de entrada) com valores sempre parametrizados via
 * `Prisma.sql`/`Prisma.join` (nunca interpolados como string).
 */
function orgScopeSql(columnSql: Prisma.Sql, legacyOrganizationId: string | null): Prisma.Sql {
  if (!legacyOrganizationId) return Prisma.sql`${columnSql} IS NULL`;
  return Prisma.sql`(${columnSql} IS NULL OR ${columnSql} = ${legacyOrganizationId})`;
}

/** Mesma consistência de legacyLeadFilterWithConsistentTrip, para consultas em SQL puro (busca literal de leads). */
function leadAccessWhereSql(legacyOrganizationId: string | null): Prisma.Sql {
  return Prisma.sql`(
    ${orgScopeSql(Prisma.raw('"Lead"."organizationId"'), legacyOrganizationId)}
    AND ("Lead"."tripId" IS NULL OR EXISTS (
      SELECT 1 FROM "Trip" t WHERE t."id" = "Lead"."tripId" AND ${orgScopeSql(Prisma.raw('t."organizationId"'), legacyOrganizationId)}
    ))
  )`;
}

export function currentLegacyLeadAccessWhereSql(): Prisma.Sql {
  return leadAccessWhereSql(config.legacyTourismOrganizationId);
}

function reservationAccessJoinSql(): Prisma.Sql {
  return Prisma.sql`
    FROM "Reservation" r
    JOIN "Trip" t ON t."id" = r."tripId"
    LEFT JOIN "Lead" l ON l."id" = r."leadId"
    LEFT JOIN "Trip" lt ON lt."id" = l."tripId"
  `;
}

/** Filtros adicionais (sempre combinados por AND) para as consultas de reserva abaixo. */
export interface ReservationScopeFilters {
  id?: string;
  leadId?: string;
  tripId?: string;
  tripIdNot?: string;
  status?: string;
}

function reservationAccessWhereSql(legacyOrganizationId: string | null, filters: ReservationScopeFilters = {}): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    orgScopeSql(Prisma.raw('r."organizationId"'), legacyOrganizationId),
    orgScopeSql(Prisma.raw('t."organizationId"'), legacyOrganizationId),
    // Lead ausente: ok. Lead presente: a própria organização do lead, a
    // organização da viagem do lead (se houver) e a viagem do lead (se
    // houver) precisam estar no escopo e coincidir com a viagem da reserva.
    Prisma.sql`(
      r."leadId" IS NULL
      OR (
        ${orgScopeSql(Prisma.raw('l."organizationId"'), legacyOrganizationId)}
        AND (l."tripId" IS NULL OR ${orgScopeSql(Prisma.raw('lt."organizationId"'), legacyOrganizationId)})
        AND (l."tripId" IS NULL OR l."tripId" = r."tripId")
      )
    )`,
  ];
  if (filters.id) conditions.push(Prisma.sql`r."id" = ${filters.id}`);
  if (filters.leadId) conditions.push(Prisma.sql`r."leadId" = ${filters.leadId}`);
  if (filters.tripId) conditions.push(Prisma.sql`r."tripId" = ${filters.tripId}`);
  if (filters.tripIdNot) conditions.push(Prisma.sql`r."tripId" != ${filters.tripIdNot}`);
  if (filters.status) conditions.push(Prisma.sql`r."status" = ${filters.status}`);
  return Prisma.join(conditions, ' AND ');
}

/** Existência (não a linha): uma busca por ID só consulta o ID necessário, nunca a tabela inteira. */
export async function reservationExistsInLegacyScope(
  client: ReservationQueryClient,
  legacyOrganizationId: string | null,
  filters: ReservationScopeFilters,
): Promise<boolean> {
  const where = reservationAccessWhereSql(legacyOrganizationId, filters);
  const rows = await client.$queryRaw<Array<{ found: number }>>(Prisma.sql`
    SELECT 1 AS found ${reservationAccessJoinSql()} WHERE ${where} LIMIT 1
  `);
  return rows.length > 0;
}

/** IDs de uma única página já filtrada, ordenada e limitada pelo próprio SQLite (nunca a tabela inteira). */
export async function reservationIdsInLegacyScopePage(
  client: ReservationQueryClient,
  legacyOrganizationId: string | null,
  filters: ReservationScopeFilters,
  page: { skip: number; take: number },
): Promise<string[]> {
  const where = reservationAccessWhereSql(legacyOrganizationId, filters);
  const rows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT r."id" AS id ${reservationAccessJoinSql()}
    WHERE ${where}
    ORDER BY r."createdAt" DESC, r."id" DESC
    LIMIT ${page.take} OFFSET ${page.skip}
  `);
  return rows.map((row) => row.id);
}

/** Contagem agregada no próprio SQLite — nunca busca nem materializa as linhas. */
export async function reservationCountInLegacyScope(
  client: ReservationQueryClient,
  legacyOrganizationId: string | null,
  filters: ReservationScopeFilters,
): Promise<number> {
  const where = reservationAccessWhereSql(legacyOrganizationId, filters);
  const rows = await client.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*) AS total ${reservationAccessJoinSql()} WHERE ${where}
  `);
  return Number(rows[0]?.total ?? 0);
}

export async function currentReservationExistsInLegacyScope(
  client: ReservationQueryClient,
  filters: ReservationScopeFilters,
): Promise<boolean> {
  return reservationExistsInLegacyScope(client, config.legacyTourismOrganizationId, filters);
}

export async function currentReservationIdsInLegacyScopePage(
  client: ReservationQueryClient,
  filters: ReservationScopeFilters,
  page: { skip: number; take: number },
): Promise<string[]> {
  return reservationIdsInLegacyScopePage(client, config.legacyTourismOrganizationId, filters, page);
}

export async function currentReservationCountInLegacyScope(
  client: ReservationQueryClient,
  filters: ReservationScopeFilters,
): Promise<number> {
  return reservationCountInLegacyScope(client, config.legacyTourismOrganizationId, filters);
}
