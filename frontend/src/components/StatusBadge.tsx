import React from 'react';

/** Cores fixas (--success-*, --warning-*, --danger-*, --info-*, em index.css) — nunca derivadas da marca da empresa, para o estado continuar reconhecível em qualquer paleta de agência. */
export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/** Selo de status (viagem, reserva etc.) com a mesma aparência em qualquer tela do painel. */
export default function StatusBadge({ tone, children, className }: { tone: StatusTone; children: React.ReactNode; className?: string }) {
  return <span className={`badge-${tone}${className ? ` ${className}` : ''}`}>{children}</span>;
}
