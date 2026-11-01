import React from 'react';
import { ChevronDown } from 'lucide-react';

interface FormSectionProps {
  title: string;
  /** Frase curta que explica o que há dentro. */
  summary?: string;
  /** Quantos campos desta seção já têm algo preenchido (mostrado quando fechada). */
  filled?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * Seção recolhível. O conteúdo continua montado quando fechada (é só <details>), então
 * abrir e fechar nunca perde o que já foi digitado.
 */
export default function FormSection({ title, summary, filled = 0, defaultOpen = false, children }: FormSectionProps) {
  return (
    <details className="form-section group" open={defaultOpen || undefined}>
      <summary>
        <div className="flex-1 min-w-0">
          <span className="block font-semibold text-surface-900">{title}</span>
          {summary ? <span className="block text-sm text-surface-600">{summary}</span> : null}
        </div>
        {filled > 0 ? <span className="badge badge-info shrink-0">{filled} preenchido{filled > 1 ? 's' : ''}</span> : null}
        <ChevronDown className="w-5 h-5 text-surface-600 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="p-5 space-y-5">{children}</div>
    </details>
  );
}
