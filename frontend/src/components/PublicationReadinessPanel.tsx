import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

export interface PublicationIssue {
  /** Texto explicando o que falta. */
  message: string;
  /** Id do campo correspondente na tela, se houver um para focar. */
  field?: string;
}

interface PublicationReadinessPanelProps {
  /** Pendências que impedem publicação (vazia = pronto). */
  problems: PublicationIssue[];
  /** Leva o foco até o campo da pendência clicada. */
  onFieldFocus?: (fieldId: string) => void;
}

/**
 * Painel que mostra claramente o que falta para publicar uma viagem.
 * Verde = pronto, amarelo = pendências. Cada pendência com campo conhecido
 * é clicável e leva o foco até o campo correspondente no formulário.
 */
export default function PublicationReadinessPanel({ problems, onFieldFocus }: PublicationReadinessPanelProps) {
  const isReady = problems.length === 0;

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        isReady
          ? 'border-green-200 bg-green-50'
          : 'border-yellow-200 bg-yellow-50'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {isReady ? (
          <CheckCircle className="w-5 h-5 text-green-700 shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <AlertCircle className="w-5 h-5 text-yellow-700 shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <div className="flex-1 min-w-0">
          {isReady ? (
            <p className="text-sm font-semibold text-green-900">
              Esta viagem está pronta para publicar.
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-yellow-900">
                Faltam {problems.length} item{problems.length > 1 ? 's' : ''} para publicar
              </p>
              <ul className="mt-2 space-y-1 text-sm text-yellow-800">
                {problems.map((problem, idx) => (
                  <li key={idx} className="flex items-start gap-1">
                    <span className="shrink-0">•</span>
                    {problem.field && onFieldFocus ? (
                      <button
                        type="button"
                        className="text-left underline hover:no-underline"
                        onClick={() => onFieldFocus(problem.field!)}
                      >
                        {problem.message}
                      </button>
                    ) : (
                      <span>{problem.message}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
