import { request } from './index';

export type PassengerPaymentStatus = 'UNPAID' | 'DEPOSIT_50' | 'PAID_90' | 'PAID_100' | 'RAFFLE' | 'OTHER';
export interface PassengerProfile {
  id: string; fullName: string; phone: string | null; hasTravelHistory: boolean; createdAt: string;
}
export interface PassengerTripRow {
  id: string; source: string; paymentStatus: PassengerPaymentStatus | null; paymentLabel: string | null;
  amountCents: number | null; attended: boolean | null; profile: PassengerProfile;
}
interface Page<T> { data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }

const passengerRequest = <T>(path: string, method = 'GET', body?: unknown) => request<T>(`/passengers${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const passengerApi = {
  profiles: (search = '') => passengerRequest<Page<PassengerProfile>>(`/profiles?page=1&limit=200${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  trip: (tripId: string) => passengerRequest<{ trip: { id: string; title: string; startDateISO: string }; data: PassengerTripRow[] }>(`/trips/${encodeURIComponent(tripId)}`),
  add: (tripId: string, data: { profileId: string } | { fullName: string; phone?: string | null; document?: string | null; emergencyContact?: string | null; email?: string | null }) => passengerRequest<PassengerTripRow>(`/trips/${encodeURIComponent(tripId)}`, 'POST', data),
  privateDetails: (tripId: string, rowId: string) => passengerRequest<{ document: string | null; emergencyContact: string | null; email: string | null }>(`/trips/${encodeURIComponent(tripId)}/${encodeURIComponent(rowId)}/private-details`),
  update: (tripId: string, rowId: string, data: Partial<Pick<PassengerTripRow, 'paymentStatus' | 'amountCents' | 'attended'>>) => passengerRequest<PassengerTripRow>(`/trips/${encodeURIComponent(tripId)}/${encodeURIComponent(rowId)}`, 'PATCH', data),
  importWorkbook: async (file: File) => {
    const response = await fetch('/api/passengers/import-workbook', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, body: file,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Não foi possível importar a planilha.');
    return payload as { profilesRead: number; profilesCreated: number; profilesMerged: number; legacyRowsRead: number; legacyRowsAdded: number; legacyRowsAlreadyImported: number };
  },
  driverCsv: async (tripId: string) => {
    const response = await fetch(`/api/passengers/trips/${encodeURIComponent(tripId)}/driver-list.csv`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Não foi possível gerar a lista do motorista.');
    return response.blob();
  },
};

export const PASSENGER_PAYMENT_LABELS: Record<PassengerPaymentStatus, string> = {
  UNPAID: 'Não pagou', DEPOSIT_50: 'Sinal de 50%', PAID_90: '90%', PAID_100: '100%', RAFFLE: 'Rifa', OTHER: 'Outro',
};
