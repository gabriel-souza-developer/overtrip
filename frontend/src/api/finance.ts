import { request } from './index';
import type { EffectiveOutingStatus, OutingSource } from './destinations';

// Painel financeiro (só administradores, somente leitura). Valores lançados
// à mão no banco de destinos e nas reservas; nada processa pagamento.

export interface FinanceTotals {
  outings: number;
  completeOutings: number;
  passengers: number;
  courtesySeats: number;
  revenueCents: number;
  expenseCents: number;
  resultCents: number;
  marginPct: number | null;
  averageTicketCents: number | null;
  averageResultCents: number | null;
}

export type FinanceMissingField = 'passengers' | 'pricePerPerson' | 'costs';

export interface FinanceOuting {
  id: string;
  destinationId: string;
  destinationName: string;
  /** Outros destinos da mesma viagem (valores registrados uma vez, nesta saída). */
  stops: Array<{ destinationId: string; destinationName: string }>;
  status: EffectiveOutingStatus;
  statusConfirmed: boolean;
  date: string | null;
  passengers: number | null;
  courtesySeats: number | null;
  pricePerPersonCents: number | null;
  revenueCents: number | null;
  expenseCents: number | null;
  resultCents: number | null;
  siteImported: boolean;
  source: OutingSource | null;
  missing: FinanceMissingField[];
}

export interface PendingInstallment {
  id: string; reservationId: string; customerName: string; tripTitle: string; amountCents: number; dueDate: string; overdue: boolean;
}

export interface FinanceSummary {
  outings: {
    years: number[];
    year: number | null;
    totals: FinanceTotals;
    incompleteOutings: number;
    plannedOutings: number;
    cancelledOutings: number;
    /** Criadas pelo site, sem confirmação: fora dos totais. */
    unconfirmedOutings: number;
    /** Registros históricos sem status, contados pela regra antiga. */
    legacyRealizedOutings: number;
    byYear: Array<FinanceTotals & { year: number }>;
    byMonth: Array<FinanceTotals & { month: number }>;
    byDestination: Array<FinanceTotals & { key: string; destinationId: string; destinationIds: string[]; name: string }>;
    outings: FinanceOuting[];
    toConfirm: FinanceOuting[];
  };
  reservations: {
    activeReservations: number;
    /** Pedidos do WhatsApp ainda não revisados; fora dos totais. Ausente em API antiga. */
    awaitingReviewReservations?: number;
    seats: number;
    contractedCents: number;
    receivedCents: number;
    receivableCents: number;
    openInstallmentsCents: number;
    overdueCents: number;
    overdueInstallments: number;
    dueNext30DaysCents: number;
    pendingInstallments: PendingInstallment[];
  };
}

export const financeApi = {
  summary: (year: number | 'all' | null) => request<FinanceSummary>(`/finance/summary${year === null ? '' : `?year=${year}`}`),
};
