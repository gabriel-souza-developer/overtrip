import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { aiApi } from '../api';
import { buildSuggestionRows, DRAFT_KEYS, type DraftKey, type SuggestionRow, type TripDraft } from '../lib/aiDraft';
import Button from './Button';
import { mergeUnique } from '../lib/includesServices';

const DRAFT_GROUPS = ['Identificação', 'Local e data', 'Preço', 'Detalhes da viagem', 'Conteúdo e roteiro'] as const;
const DRAFT_GROUP_BY_KEY: Record<DraftKey, typeof DRAFT_GROUPS[number]> = {
  title: 'Identificação', headlineDisplay: 'Identificação', category: 'Identificação',
  region: 'Local e data', city: 'Local e data', startDateISO: 'Local e data', endDateISO: 'Local e data',
  departureTime: 'Local e data', departureTolerance: 'Local e data', returnTime: 'Local e data', scheduleInfo: 'Local e data',
  meetingCity: 'Local e data', meetingPoint: 'Local e data', meetingDetails: 'Local e data',
  priceValue: 'Preço', priceUnit: 'Preço', free: 'Preço',
  intensityClass: 'Detalhes da viagem', spotsLeft: 'Detalhes da viagem', trailDistance: 'Detalhes da viagem',
  supportPoint: 'Detalhes da viagem', supportPointInfo: 'Detalhes da viagem',
  description: 'Conteúdo e roteiro', includes: 'Conteúdo e roteiro', includedServices: 'Conteúdo e roteiro',
  itinerary: 'Conteúdo e roteiro', routeNotes: 'Conteúdo e roteiro', importantInfo: 'Conteúdo e roteiro',
};

interface Props {
  form: Record<string, unknown>;
  /** Valores padrão do formulário novo (contam como "vazio"). */
  defaults: Record<string, unknown>;
  /** Recebe as escolhas; o pai coloca no formulário. Nada é salvo aqui. */
  onApply: (draft: TripDraft, chosen: DraftKey[], overwrite: DraftKey[]) => void;
  api?: typeof aiApi;
  showUnavailable?: boolean;
}

/** "Preencher com IA": só aparece se o servidor tiver a chave. Falha aqui nunca atrapalha o formulário. */
export default function AiDraftBlock({ form, defaults, onApply, api = aiApi, showUnavailable = false }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<TripDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [checked, setChecked] = useState<Set<DraftKey>>(new Set());

  useEffect(() => {
    let alive = true;
    api.status().then(s => { if (alive) setEnabled(!!s.enabled); }).catch(() => { if (alive) setEnabled(false); });
    return () => { alive = false; };
  }, [api]);

  if (!enabled) return showUnavailable ? (
    <details className="rounded-lg border border-surface-200 p-4">
      <summary className="flex items-center gap-2 cursor-pointer"><Sparkles className="w-5 h-5 text-surface-700" aria-hidden="true" /><span className="font-semibold text-surface-900">Colar texto e sugerir com IA</span></summary>
      <p className="hint mt-3" role="status">{enabled === null ? 'Verificando disponibilidade da IA…' : 'A sugestão por texto está indisponível neste ambiente. Você pode preencher os campos manualmente.'}</p>
    </details>
  ) : null;

  const suggest = async () => {
    setError('');
    setDraft(null);
    setLoading(true);
    try {
      const result = await api.tripDraft(text);
      const clean: TripDraft = {};
      for (const key of DRAFT_KEYS) if (key !== 'includedServices' && key in result.draft) (clean as Record<string, unknown>)[key] = result.draft[key];
      clean.includes = mergeUnique(
        Array.isArray(result.draft.includes) ? result.draft.includes : [],
        Array.isArray(result.draft.includedServices) ? result.draft.includedServices : [],
      );
      const next = buildSuggestionRows(form, clean, defaults);
      setDraft(clean);
      setWarnings(result.warnings || []);
      setRows(next);
      // Campos vazios já vêm marcados; os que têm valor só entram se a pessoa marcar.
      setChecked(new Set(next.filter(r => !r.hasCurrent).map(r => r.key)));
      if (next.length === 0) setError('Não encontrei nada novo para preencher neste texto.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'A ajuda de IA não está disponível agora.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key: DraftKey) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const apply = () => {
    if (!draft) return;
    const chosen = rows.filter(r => checked.has(r.key));
    onApply(draft, chosen.map(r => r.key), chosen.filter(r => r.hasCurrent).map(r => r.key));
    setDraft(null);
    setRows([]);
    setText('');
  };

  const allChecked = rows.length > 0 && rows.every(r => checked.has(r.key));

  return (
    <details className="rounded-lg border border-surface-200 p-4">
      <summary className="flex items-center gap-2 cursor-pointer">
        <Sparkles className="w-5 h-5 text-surface-700" aria-hidden="true" />
        <span className="font-semibold text-surface-900">{showUnavailable ? 'Colar texto e sugerir com IA' : 'Ajudar a preencher com IA (opcional)'}</span>
      </summary>
      <div className="space-y-3 mt-4">
      <p className="hint">Cole a conversa ou o roteiro. A IA sugere os campos; nada é salvo até você clicar em Salvar. O que não estiver no texto fica vazio.</p>
      <p className="alert-info" role="note">Não cole dados pessoais de clientes, como nome, telefone ou CPF. No plano gratuito, o texto enviado pode ser usado pelo Google para melhorar seus produtos.</p>
      <label htmlFor="ai-text" className="sr-only">Texto da viagem</label>
      <textarea id="ai-text" className="input" rows={4} maxLength={8000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Cole aqui a descrição da viagem…" />
      <div>
        <Button variant="secondary" onClick={suggest} loading={loading} loadingText="Lendo o texto…" disabled={!text.trim()}>Sugerir campos</Button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}

      {draft && rows.length > 0 && (
        <div className="space-y-3" aria-live="polite">
          {warnings.length > 0 && (
            <div className="alert-info" role="status">
              <ul className="list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="font-semibold text-surface-900">O que será preenchido</p>
            <Button small variant="ghost" onClick={() => setChecked(allChecked ? new Set() : new Set(rows.map(r => r.key)))}>
              {allChecked ? 'Desmarcar todos' : 'Marcar todos'}
            </Button>
          </div>
          <div className="space-y-3">
            {DRAFT_GROUPS.map(group => {
              const groupRows = rows.filter(r => DRAFT_GROUP_BY_KEY[r.key] === group);
              if (groupRows.length === 0) return null;
              return (
                <section key={group} className="overflow-hidden rounded-lg border border-surface-200" aria-label={group}>
                  <h3 className="border-b border-surface-200 bg-surface-50 px-4 py-3 text-sm font-semibold text-surface-900">{group}</h3>
                  <ul className="divide-y divide-surface-200">
                    {groupRows.map(r => (
                      <li key={r.key} className={r.hasCurrent ? 'bg-amber-50 p-4' : 'p-4'}>
                        <label className="checkbox-label items-start">
                          <input type="checkbox" className="checkbox-input mt-1" checked={checked.has(r.key)} onChange={() => toggle(r.key)} />
                          <span className="text-sm min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-surface-900">{r.label}</span>
                              <span className={r.hasCurrent ? 'badge badge-warning' : 'badge badge-success'}>{r.hasCurrent ? 'Já preenchido — marque para substituir' : 'Campo vazio'}</span>
                            </span>
                            <span className="block mt-2 text-surface-600 break-words">Atual: {r.current}</span>
                            <span className="block mt-1 text-surface-900 break-words"><span className="font-medium">Sugerido:</span> {r.suggested}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <Button variant="primary" onClick={apply} disabled={checked.size === 0}>Usar selecionados ({checked.size})</Button>
        </div>
      )}
      </div>
    </details>
  );
}
