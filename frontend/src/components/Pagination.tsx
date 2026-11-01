import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination as PaginationInfo } from '../api';
import { buildPageNumbers } from '../lib/panelHelpers';

export default function Pagination({ pagination, onChange }: { pagination: PaginationInfo; onChange: (page: number) => void }) {
  if (pagination.totalPages <= 1) return null;
  const first = (pagination.page - 1) * pagination.limit + 1;
  const last = Math.min(pagination.page * pagination.limit, pagination.total);
  return (
    <nav aria-label="Páginas" className="px-4 py-3 border-t border-surface-200 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-sm text-surface-600">Mostrando {first} a {last} de {pagination.total}</p>
      <div className="pagination">
        <button type="button" className="pagination-btn min-h-[40px]" onClick={() => onChange(pagination.page - 1)} disabled={pagination.page === 1} aria-label="Página anterior">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        {buildPageNumbers(pagination.page, pagination.totalPages).map((n) => (
          <button
            key={n}
            type="button"
            className={`pagination-btn min-h-[40px] min-w-[40px] ${pagination.page === n ? 'pagination-btn-active' : ''}`}
            onClick={() => onChange(n)}
            aria-label={`Página ${n}`}
            aria-current={pagination.page === n ? 'page' : undefined}
          >
            {n}
          </button>
        ))}
        <button type="button" className="pagination-btn min-h-[40px]" onClick={() => onChange(pagination.page + 1)} disabled={pagination.page === pagination.totalPages} aria-label="Próxima página">
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
