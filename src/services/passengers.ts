import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { currentLegacyTourismFilter } from './legacyTourismScope.js';
import { decryptPassengerValue, encryptPassengerValue, passengerLookup, passengerOpaqueKey } from './passengerDataCrypto.js';

export const PASSENGER_PAYMENT_STATUSES = ['UNPAID', 'DEPOSIT_50', 'PAID_90', 'PAID_100', 'RAFFLE', 'OTHER'] as const;
export type PassengerPaymentStatus = typeof PASSENGER_PAYMENT_STATUSES[number];

export class PassengerDataUnavailable extends Error {}
export class PassengerDataError extends Error {
  constructor(public readonly code: 'INVALID_WORKBOOK' | 'TOO_MANY_ROWS' | 'TRIP_NOT_FOUND' | 'PROFILE_NOT_FOUND' | 'DUPLICATE_PASSENGER' | 'INVALID_INPUT') { super(code); }
}

export function assertPassengerEncryptionReady() {
  // Probe with a non-PII value so disabled configuration fails closed.
  try { encryptPassengerValue('key-check', 'name'); }
  catch { throw new PassengerDataUnavailable('Passenger data encryption is not configured.'); }
}

const normalizeText = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim();
const normalizeNameKey = (value: string) => normalizeText(value).toLocaleLowerCase('pt-BR');
const normalizePhoneKey = (value: string | null) => value ? value.replace(/\D/g, '') : '';
const normalizeDocumentKey = (value: string | null) => value ? value.replace(/\W/g, '').toLocaleUpperCase('pt-BR') : '';
const passengerOrganizationWhere = () => config.legacyTourismOrganizationId
  ? { OR: [{ organizationId: null }, { organizationId: config.legacyTourismOrganizationId }] }
  : { organizationId: null };

export interface PassengerInput {
  fullName: string;
  phone?: string | null;
  document?: string | null;
  emergencyContact?: string | null;
  email?: string | null;
}

function validatePassenger(input: PassengerInput): Required<Pick<PassengerInput, 'fullName'>> & PassengerInput {
  const fullName = normalizeText(input.fullName ?? '');
  if (fullName.length < 2 || fullName.length > 150) throw new PassengerDataError('INVALID_INPUT');
  const fields = ['phone', 'document', 'emergencyContact', 'email'] as const;
  for (const field of fields) {
    const value = input[field];
    if (value != null && (typeof value !== 'string' || value.length > (field === 'emergencyContact' ? 240 : 160))) throw new PassengerDataError('INVALID_INPUT');
  }
  return { ...input, fullName, phone: input.phone?.trim() || null, document: input.document?.trim() || null, emergencyContact: input.emergencyContact?.trim() || null, email: input.email?.trim() || null };
}

function identityHashes(input: PassengerInput) {
  const person = validatePassenger(input);
  const scope = config.legacyTourismOrganizationId ?? 'legacy';
  const name = normalizeNameKey(person.fullName);
  const digits = normalizePhoneKey(person.phone ?? null);
  const doc = normalizeDocumentKey(person.document ?? null);
  return {
    nameLookup: passengerLookup(`${scope}\0${name}`, 'name'),
    documentLookup: doc ? passengerLookup(`${scope}\0${doc}`, 'document') : null,
    phoneNameLookup: digits ? passengerLookup(`${scope}\0${digits}\0${name}`, 'phoneName') : null,
  };
}

async function resolveProfile(tx: Prisma.TransactionClient, raw: PassengerInput, importIdentityLookup?: string, hasTravelHistory = true) {
  const input = validatePassenger(raw);
  const hashes = identityHashes(input);
  const organizationFilter = passengerOrganizationWhere();
  let profile = importIdentityLookup
    ? await tx.passengerProfile.findFirst({ where: { importIdentityLookup, ...organizationFilter } })
    : null;
  if (!profile && hashes.documentLookup) profile = await tx.passengerProfile.findFirst({ where: { documentLookup: hashes.documentLookup, ...organizationFilter } });
  if (!profile && hashes.phoneNameLookup) profile = await tx.passengerProfile.findFirst({ where: { phoneNameLookup: hashes.phoneNameLookup, ...organizationFilter } });
  if (!profile) {
    const sameName = await tx.passengerProfile.findMany({ where: { nameLookup: hashes.nameLookup, ...organizationFilter }, take: 2 });
    if (sameName.length === 1) {
      const candidate = sameName[0];
      const existingPhone = decryptPassengerValue(candidate.phoneCipher, 'phone');
      const existingDocument = decryptPassengerValue(candidate.documentCipher, 'document');
      const phoneConflicts = Boolean(existingPhone && input.phone && normalizePhoneKey(existingPhone) !== normalizePhoneKey(input.phone));
      const documentConflicts = Boolean(existingDocument && input.document && normalizeDocumentKey(existingDocument) !== normalizeDocumentKey(input.document));
      if (!phoneConflicts && !documentConflicts) profile = candidate;
    }
  }

  const encrypted = {
    nameCipher: encryptPassengerValue(input.fullName, 'name')!,
    phoneCipher: encryptPassengerValue(input.phone, 'phone'),
    documentCipher: encryptPassengerValue(input.document, 'document'),
    emergencyCipher: encryptPassengerValue(input.emergencyContact, 'emergency'),
    emailCipher: encryptPassengerValue(input.email, 'email'),
  };
  if (profile) {
    const updated = await tx.passengerProfile.update({ where: { id: profile.id }, data: {
      nameCipher: profile.nameCipher || encrypted.nameCipher,
      phoneCipher: profile.phoneCipher || encrypted.phoneCipher,
      documentCipher: profile.documentCipher || encrypted.documentCipher,
      emergencyCipher: profile.emergencyCipher || encrypted.emergencyCipher,
      emailCipher: profile.emailCipher || encrypted.emailCipher,
      documentLookup: profile.documentLookup || hashes.documentLookup,
      phoneNameLookup: profile.phoneNameLookup || hashes.phoneNameLookup,
      hasTravelHistory: profile.hasTravelHistory || hasTravelHistory,
      ...(importIdentityLookup && !profile.importIdentityLookup ? { importIdentityLookup } : {}),
    } });
    return { profile: updated, created: false };
  }
  const created = await tx.passengerProfile.create({ data: {
    ...encrypted, ...hashes, importIdentityLookup, organizationId: config.legacyTourismOrganizationId,
    hasTravelHistory,
  } });
  return { profile: created, created: true };
}

function cellString(cell: ExcelJS.Cell): string | null {
  const value = cell.value;
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    if ('result' in value && value.result != null) return String(value.result);
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map(part => part.text).join('');
    if ('formula' in value && cell.text) return cell.text;
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function cellDisplay(cell: ExcelJS.Cell) {
  return cell.text?.trim() || cellString(cell);
}

function validateZipContainer(bytes: Buffer) {
  const minOffset = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { endOffset = offset; break; }
  }
  if (endOffset < 0 || endOffset + 22 > bytes.length) throw new PassengerDataError('INVALID_WORKBOOK');
  const entries = bytes.readUInt16LE(endOffset + 10);
  const centralDirectorySize = bytes.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(endOffset + 16);
  if (entries < 1 || entries > 100 || centralDirectoryOffset + centralDirectorySize > endOffset) throw new PassengerDataError('INVALID_WORKBOOK');
  let cursor = centralDirectoryOffset;
  let uncompressedTotal = 0;
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new PassengerDataError('INVALID_WORKBOOK');
    const compressed = bytes.readUInt32LE(cursor + 20);
    const uncompressed = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const flags = bytes.readUInt16LE(cursor + 8);
    if ((flags & 1) !== 0 || uncompressed > 10_000_000 || (compressed === 0 ? uncompressed > 0 : uncompressed / compressed > 100)) {
      throw new PassengerDataError('INVALID_WORKBOOK');
    }
    uncompressedTotal += uncompressed;
    if (uncompressedTotal > 20_000_000) throw new PassengerDataError('INVALID_WORKBOOK');
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor > centralDirectoryOffset + centralDirectorySize) throw new PassengerDataError('INVALID_WORKBOOK');
}

function stableImportRowKey(kind: 'responses' | 'roster', input: PassengerInput, occurrence = 0) {
  const hashes = identityHashes(input);
  // A roster row key must survive later corrections to phone/document/payment fields.
  // The occurrence number preserves distinct same-name legacy rows in workbook order.
  const identity = kind === 'roster' ? hashes.nameLookup : hashes.documentLookup || hashes.phoneNameLookup || hashes.nameLookup;
  const scope = config.legacyTourismOrganizationId ?? 'legacy';
  return passengerOpaqueKey(`${scope}:${kind}:${identity}:${occurrence}`);
}

function rowHeaderIndexes(row: ExcelJS.Row) {
  const headers = new Map<string, number>();
  row.eachCell({ includeEmpty: false }, (cell, column) => {
    const text = normalizeNameKey(cellString(cell) ?? '');
    headers.set(text, column);
  });
  return headers;
}

function findHeader(headers: Map<string, number>, predicate: (header: string) => boolean): number | null {
  for (const [header, column] of headers) if (predicate(header)) return column;
  return null;
}

function paymentStatus(value: string | null): PassengerPaymentStatus | null {
  if (!value) return null;
  const normalized = value.trim().toLocaleLowerCase('pt-BR');
  if (normalized.includes('não pagou') || normalized === 'nao pagou') return 'UNPAID';
  if (normalized.includes('rifa')) return 'RAFFLE';
  const percent = normalized.match(/(\d{1,3})\s*%/);
  if (percent) {
    const amount = Number(percent[1]);
    if (amount >= 100) return 'PAID_100';
    if (amount >= 90) return 'PAID_90';
    if (amount >= 50) return 'DEPOSIT_50';
    return 'OTHER';
  }
  const numeric = Number(normalized.replace(',', '.'));
  if (Number.isFinite(numeric)) {
    if (numeric >= 1) return 'PAID_100';
    if (numeric >= 0.9) return 'PAID_90';
    if (numeric >= 0.5) return 'DEPOSIT_50';
  }
  return 'OTHER';
}

function paymentLabel(value: string | null): string | null {
  return value ? normalizeText(value).slice(0, 60) : null;
}

function centsValue(value: string | null): number | null {
  if (!value) return null;
  const numeric = Number(value.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100_000_000, Math.round(numeric * 100))) : null;
}

function boolValue(value: string | null): boolean | null {
  if (!value) return null;
  const normalized = value.toLocaleLowerCase('pt-BR');
  if (['true', 'sim', '1', 'presente'].includes(normalized)) return true;
  if (['false', 'não', 'nao', '0', 'ausente'].includes(normalized)) return false;
  return null;
}

interface ImportedPassenger extends PassengerInput { rowKey: string }
interface ImportedLegacyRecord extends PassengerInput {
  rowKey: string;
  paymentStatus: PassengerPaymentStatus | null;
  paymentLabel: string | null;
  amountCents: number | null;
  attended: boolean | null;
}

export interface ParsedPassengerWorkbook {
  people: ImportedPassenger[];
  legacyRecords: ImportedLegacyRecord[];
}

export async function parsePassengerWorkbook(bytes: Buffer): Promise<ParsedPassengerWorkbook> {
  if (bytes.length < 100 || bytes.length > 5_000_000 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new PassengerDataError('INVALID_WORKBOOK');
  validateZipContainer(bytes);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]); } catch { throw new PassengerDataError('INVALID_WORKBOOK'); }
  const responses = workbook.worksheets.find(sheet => normalizeNameKey(sheet.name).includes('respostas do forms'));
  const roster = workbook.worksheets.find(sheet => normalizeNameKey(sheet.name).includes('lista de passageiros viagem'));
  if (!responses || !roster) throw new PassengerDataError('INVALID_WORKBOOK');

  const responseHeaders = rowHeaderIndexes(responses.getRow(1));
  const responseColumns = {
    name: findHeader(responseHeaders, value => value.startsWith('nome completo')),
    emergency: findHeader(responseHeaders, value => value.startsWith('nome e telefone de contato')),
    phone: findHeader(responseHeaders, value => value.startsWith('número de telefone pessoal') || value.startsWith('numero de telefone pessoal')),
    document: findHeader(responseHeaders, value => value.startsWith('cpf')),
    email: findHeader(responseHeaders, value => value.startsWith('e-mail') || value.startsWith('email')),
  };
  if (!responseColumns.name || !responseColumns.phone || !responseColumns.document) throw new PassengerDataError('INVALID_WORKBOOK');
  const people: ImportedPassenger[] = [];
  for (let rowNumber = 2; rowNumber <= responses.rowCount; rowNumber += 1) {
    const row = responses.getRow(rowNumber);
    const fullName = cellString(row.getCell(responseColumns.name));
    if (!fullName) continue;
    let document = cellString(row.getCell(responseColumns.document));
    const documentDigits = document?.replace(/\D/g, '') ?? '';
    if (documentDigits.length === 10) document = `0${documentDigits}`; // CPF numeric cell lost a leading zero in Excel.
    const input: PassengerInput = {
      fullName,
      phone: responseColumns.phone ? cellString(row.getCell(responseColumns.phone)) : null,
      document,
      emergencyContact: responseColumns.emergency ? cellString(row.getCell(responseColumns.emergency)) : null,
      email: responseColumns.email ? cellString(row.getCell(responseColumns.email)) : null,
    };
    people.push({ ...input, rowKey: stableImportRowKey('responses', input) });
  }

  const rosterHeaders = rowHeaderIndexes(roster.getRow(1));
  const rosterColumns = {
    name: findHeader(rosterHeaders, value => value === 'nome completo'),
    document: findHeader(rosterHeaders, value => value.startsWith('cpf ou rg')),
    phone: findHeader(rosterHeaders, value => value === 'contato'),
    emergency: findHeader(rosterHeaders, value => value.startsWith('nome e telefone de contato')),
    attended: findHeader(rosterHeaders, value => value === 'presente'),
    amount: findHeader(rosterHeaders, value => value === 'total'),
    status: findHeader(rosterHeaders, value => value === 'status'),
  };
  if (!rosterColumns.name || !rosterColumns.status) throw new PassengerDataError('INVALID_WORKBOOK');
  const legacyRecords: ImportedLegacyRecord[] = [];
  const duplicateIdentityOccurrences = new Map<string, number>();
  for (let rowNumber = 2; rowNumber <= roster.rowCount; rowNumber += 1) {
    const row = roster.getRow(rowNumber);
    const fullName = cellString(row.getCell(rosterColumns.name));
    if (!fullName) continue;
    const input: PassengerInput = {
      fullName,
      phone: rosterColumns.phone ? cellString(row.getCell(rosterColumns.phone)) : null,
      document: rosterColumns.document ? cellString(row.getCell(rosterColumns.document)) : null,
      emergencyContact: rosterColumns.emergency ? cellString(row.getCell(rosterColumns.emergency)) : null,
    };
    const rawStatus = cellDisplay(row.getCell(rosterColumns.status));
    const rawAmount = rosterColumns.amount ? cellString(row.getCell(rosterColumns.amount)) : null;
    const identity = identityHashes(input);
    const identityKey = identity.nameLookup;
    const occurrence = duplicateIdentityOccurrences.get(identityKey) ?? 0;
    duplicateIdentityOccurrences.set(identityKey, occurrence + 1);
    legacyRecords.push({
      ...input,
      rowKey: stableImportRowKey('roster', input, occurrence),
      paymentStatus: paymentStatus(rawStatus),
      paymentLabel: paymentLabel(rawStatus),
      amountCents: centsValue(rawAmount),
      attended: rosterColumns.attended ? boolValue(cellString(row.getCell(rosterColumns.attended))) : null,
    });
  }
  if (people.length > 250 || legacyRecords.length > 500) throw new PassengerDataError('TOO_MANY_ROWS');
  return { people, legacyRecords };
}

function profileSummary(profile: { id: string; nameCipher: string; phoneCipher: string | null; hasTravelHistory: boolean; createdAt: Date }) {
  return {
    id: profile.id,
    fullName: decryptPassengerValue(profile.nameCipher, 'name') ?? '',
    phone: decryptPassengerValue(profile.phoneCipher, 'phone'),
    hasTravelHistory: profile.hasTravelHistory,
    createdAt: profile.createdAt,
  };
}

export async function importPassengerWorkbook(bytes: Buffer, actorUserId: string) {
  assertPassengerEncryptionReady();
  const parsed = await parsePassengerWorkbook(bytes);
  let createdProfiles = 0;
  let mergedProfiles = 0;
  let addedHistory = 0;
  let existingHistory = 0;
  await prisma.$transaction(async tx => {
    for (const person of parsed.people) {
      const before = await tx.passengerProfile.findUnique({ where: { importIdentityLookup: person.rowKey }, select: { id: true } });
      const resolved = await resolveProfile(tx, person, person.rowKey, true);
      if (before || !resolved.created) mergedProfiles += 1;
      else createdProfiles += 1;
    }
    for (const record of parsed.legacyRecords) {
      const existing = await tx.passengerTrip.findUnique({ where: { legacyImportKey: record.rowKey }, select: { id: true } });
      const { profile } = await resolveProfile(tx, record, undefined, true);
      const historyData = {
        paymentStatus: record.paymentStatus,
        paymentLabel: record.paymentLabel,
        amountCents: record.amountCents,
        attended: record.attended,
      };
      if (existing) {
        await tx.passengerTrip.update({ where: { id: existing.id }, data: { ...historyData, profileId: profile.id } });
        existingHistory += 1;
      } else {
        await tx.passengerTrip.create({ data: {
          profileId: profile.id,
          tripId: null,
          legacyTripTitle: null,
          ...historyData,
          source: 'LEGACY_IMPORT',
          legacyImportKey: record.rowKey,
        } });
        addedHistory += 1;
      }
    }
    await tx.passengerAuditLog.create({ data: { actorUserId, action: 'LEGACY_IMPORT', rowCount: parsed.people.length + parsed.legacyRecords.length } });
  }, { maxWait: 5000, timeout: 30000 });
  return { profilesRead: parsed.people.length, profilesCreated: createdProfiles, profilesMerged: mergedProfiles, legacyRowsRead: parsed.legacyRecords.length, legacyRowsAdded: addedHistory, legacyRowsAlreadyImported: existingHistory };
}

export async function listPassengerProfiles(params: { page: number; limit: number; search?: string }) {
  assertPassengerEncryptionReady();
  const rows = await prisma.passengerProfile.findMany({ where: passengerOrganizationWhere(), orderBy: { createdAt: 'desc' }, take: 5000 });
  const query = normalizeNameKey(params.search ?? '');
  const filtered = rows.map(profileSummary).filter(profile => !query || normalizeNameKey(profile.fullName).includes(query));
  const total = filtered.length;
  const data = filtered.slice((params.page - 1) * params.limit, params.page * params.limit);
  return { data, pagination: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) } };
}

async function requireTrip(tripId: string) {
  const trip = await prisma.trip.findFirst({ where: { id: tripId, ...currentLegacyTourismFilter() }, select: { id: true, title: true, startDateISO: true } });
  if (!trip) throw new PassengerDataError('TRIP_NOT_FOUND');
  return trip;
}

export async function listTripPassengers(tripId: string) {
  assertPassengerEncryptionReady();
  const trip = await requireTrip(tripId);
  const rows = await prisma.passengerTrip.findMany({ where: { tripId }, include: { profile: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return { trip, data: rows.map(row => ({
    id: row.id, source: row.source, paymentStatus: row.paymentStatus, paymentLabel: row.paymentLabel,
    amountCents: row.amountCents, attended: row.attended, profile: profileSummary(row.profile),
  })) };
}

export async function listUnassignedPassengers() {
  assertPassengerEncryptionReady();
  const profiles = await prisma.passengerTrip.findMany({
    where: { tripId: null, source: 'LEGACY_IMPORT', profile: passengerOrganizationWhere() },
    include: { profile: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 500,
  });
  return profiles.map(row => ({
    id: row.id, source: row.source, paymentStatus: row.paymentStatus, paymentLabel: row.paymentLabel,
    amountCents: row.amountCents, attended: row.attended, profile: profileSummary(row.profile),
  }));
}

export async function addPassengerToTrip(tripId: string, input: PassengerInput, actorUserId: string) {
  assertPassengerEncryptionReady();
  await requireTrip(tripId);
  const { profile } = await prisma.$transaction(tx => resolveProfile(tx, input, undefined, false));
  const existing = await prisma.passengerTrip.findFirst({ where: { tripId, profileId: profile.id } });
  if (existing) throw new PassengerDataError('DUPLICATE_PASSENGER');
  try {
    const row = await prisma.$transaction(async tx => {
      const created = await tx.passengerTrip.create({ data: { tripId, profileId: profile.id, source: 'MANUAL' } });
      await tx.passengerAuditLog.create({ data: { actorUserId, action: 'PASSENGER_ADDED', tripId, passengerTripId: created.id } });
      return created;
    });
    return { id: row.id, profile: profileSummary(profile), paymentStatus: null, paymentLabel: null, amountCents: null, attended: null, source: row.source };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new PassengerDataError('DUPLICATE_PASSENGER');
    throw error;
  }
}

export async function addExistingPassengerToTrip(tripId: string, profileId: string, actorUserId: string) {
  assertPassengerEncryptionReady();
  await requireTrip(tripId);
  const where = { id: profileId, ...passengerOrganizationWhere() };
  const profile = await prisma.passengerProfile.findFirst({ where });
  if (!profile) throw new PassengerDataError('PROFILE_NOT_FOUND');
  try {
    const row = await prisma.$transaction(async tx => {
      const created = await tx.passengerTrip.create({ data: { tripId, profileId, source: 'MANUAL' } });
      await tx.passengerAuditLog.create({ data: { actorUserId, action: 'PASSENGER_ADDED', tripId, passengerTripId: created.id } });
      return created;
    });
    return { id: row.id, profile: profileSummary(profile), paymentStatus: null, paymentLabel: null, amountCents: null, attended: null, source: row.source };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new PassengerDataError('DUPLICATE_PASSENGER');
    throw error;
  }
}

export async function privatePassengerDetails(tripId: string, passengerTripId: string) {
  assertPassengerEncryptionReady();
  await requireTrip(tripId);
  const row = await prisma.passengerTrip.findFirst({ where: { id: passengerTripId, tripId }, include: { profile: true } });
  if (!row) throw new PassengerDataError('PROFILE_NOT_FOUND');
  return {
    document: decryptPassengerValue(row.profile.documentCipher, 'document'),
    emergencyContact: decryptPassengerValue(row.profile.emergencyCipher, 'emergency'),
    email: decryptPassengerValue(row.profile.emailCipher, 'email'),
  };
}

export async function updateTripPassenger(tripId: string, passengerTripId: string, patch: { paymentStatus?: PassengerPaymentStatus | null; amountCents?: number | null; attended?: boolean | null }, actorUserId: string) {
  await requireTrip(tripId);
  const existing = await prisma.passengerTrip.findFirst({ where: { id: passengerTripId, tripId }, include: { profile: true } });
  if (!existing) throw new PassengerDataError('PROFILE_NOT_FOUND');
  const updated = await prisma.$transaction(async tx => {
    const row = await tx.passengerTrip.update({ where: { id: passengerTripId }, data: patch });
    if (patch.attended === true) await tx.passengerProfile.update({ where: { id: existing.profileId }, data: { hasTravelHistory: true } });
    await tx.passengerAuditLog.create({ data: { actorUserId, action: 'PASSENGER_TRIP_UPDATED', tripId, passengerTripId } });
    return row;
  });
  return { id: updated.id, profile: profileSummary(existing.profile), paymentStatus: updated.paymentStatus, paymentLabel: updated.paymentLabel, amountCents: updated.amountCents, attended: updated.attended, source: updated.source };
}

export async function assignUnassignedPassenger(passengerTripId: string, tripId: string, actorUserId: string) {
  await requireTrip(tripId);
  return prisma.$transaction(async tx => {
    const row = await tx.passengerTrip.findFirst({ where: { id: passengerTripId, tripId: null, source: 'LEGACY_IMPORT', profile: passengerOrganizationWhere() }, include: { profile: true } });
    if (!row) throw new PassengerDataError('PROFILE_NOT_FOUND');
    const duplicate = await tx.passengerTrip.findFirst({ where: { tripId, profileId: row.profileId } });
    if (duplicate) throw new PassengerDataError('DUPLICATE_PASSENGER');
    const updated = await tx.passengerTrip.update({ where: { id: row.id }, data: { tripId, legacyTripTitle: null } });
    await tx.passengerAuditLog.create({ data: { actorUserId, action: 'LEGACY_PASSENGER_ASSIGNED', tripId, passengerTripId } });
    return { id: updated.id };
  });
}

function safeCsv(value: string | null) {
  let safe = (value ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (/^[=+\-@\t]/.test(safe)) safe = `'${safe}`;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function driverPassengerCsv(tripId: string, actorUserId: string) {
  assertPassengerEncryptionReady();
  const trip = await requireTrip(tripId);
  const rows = await prisma.passengerTrip.findMany({ where: { tripId }, include: { profile: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const output = ['Nome,Telefone', ...rows.map(row => [
    safeCsv(decryptPassengerValue(row.profile.nameCipher, 'name')),
    safeCsv(decryptPassengerValue(row.profile.phoneCipher, 'phone')),
  ].join(','))].join('\r\n');
  await prisma.passengerAuditLog.create({ data: { actorUserId, action: 'DRIVER_LIST_EXPORTED', tripId, rowCount: rows.length } });
  const slug = trip.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'trip';
  return { filename: `embarque-${slug}.csv`, contents: `\uFEFF${output}`, rowCount: rows.length };
}
