import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { config } from '../config.js';

const VERSION = 'p1';
const CONTEXT = 'overtrip-passenger-data-v1';
const PURPOSES = ['name', 'phone', 'document', 'emergency', 'email', 'lookup'] as const;
export type PassengerDataPurpose = typeof PURPOSES[number];

function rootKey(): Buffer {
  const value = config.passengerDataEncryptionKey;
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('PASSENGER_DATA_ENCRYPTION_KEY is not configured.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) throw new Error('PASSENGER_DATA_ENCRYPTION_KEY is not configured.');
  return key;
}

function purposeKey(purpose: PassengerDataPurpose): Buffer {
  if (!PURPOSES.includes(purpose)) throw new Error('Invalid passenger data purpose.');
  return Buffer.from(hkdfSync('sha256', rootKey(), Buffer.from(CONTEXT), Buffer.from(purpose), 32));
}

export function passengerLookup(value: string, purpose: 'name' | 'phoneName' | 'document'): string {
  const keyPurpose: PassengerDataPurpose = purpose === 'phoneName' ? 'lookup' : purpose;
  const digest = createHmac('sha256', purposeKey(keyPurpose)).update(`${purpose}\0${value.normalize('NFC').trim().toLocaleLowerCase('pt-BR')}`).digest('hex');
  return digest;
}

export function passengerOpaqueKey(value: string): string {
  return createHmac('sha256', purposeKey('lookup')).update(`${CONTEXT}:opaque\0${value}`, 'utf8').digest('hex');
}

export function encryptPassengerValue(value: string | null | undefined, purpose: Exclude<PassengerDataPurpose, 'lookup'>): string | null {
  if (value == null || value.trim() === '') return null;
  if (Buffer.byteLength(value, 'utf8') > 4096) throw new Error('Passenger data field is too large.');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', purposeKey(purpose), nonce);
  cipher.setAAD(Buffer.from(`${CONTEXT}:${purpose}`));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [VERSION, nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptPassengerValue(value: string | null, purpose: Exclude<PassengerDataPurpose, 'lookup'>): string | null {
  if (value == null) return null;
  try {
    const parts = value.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Invalid envelope.');
    const decode = (part: string) => {
      if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('Invalid part.');
      const buffer = Buffer.from(part, 'base64url');
      if (buffer.toString('base64url') !== part) throw new Error('Invalid part.');
      return buffer;
    };
    const nonce = decode(parts[1]); const tag = decode(parts[2]); const encrypted = decode(parts[3]);
    if (nonce.length !== 12 || tag.length !== 16 || encrypted.length > 4096) throw new Error('Invalid envelope.');
    const decipher = createDecipheriv('aes-256-gcm', purposeKey(purpose), nonce);
    decipher.setAAD(Buffer.from(`${CONTEXT}:${purpose}`));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Não foi possível acessar os dados protegidos do passageiro.');
  }
}
