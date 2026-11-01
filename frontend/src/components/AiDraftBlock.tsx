import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { aiApi } from '../api';
import { buildSuggestionRows, DRAFT_KEYS, type DraftKey, type SuggestionRow, type TripDraft } from '../lib/aiDraft';
import Button from './Button';

interface Props {
  form: Record<string, unknown>;
  /** Valores padrão do formulário novo (contam como "vazio"). */
  defaults: Record<string, unknown>;
  /** Recebe as escolhas; o pai coloca no formulário. Nada é salvo aqui. */
  onApply: (draft: TripDraft, chosen: DraftKey[], overwrite: DraftKey[]) => void;
}

/** "Preencher com IA": só aparece se o servidor tiver a chave. Falha aqui nunca atrapalha o formulário. */
export default function AiDraftBlock({ form, defaults, onApply }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<TripDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [checked, setChecked] = useState<Set<DraftKey>>(new Set());

  useEffect(() => {
    let alive = true;
    aiApi.status().then(s => { if (alive) setEnabled(!!s.enabled); }).catch(() => { if (alive) setEnabled(false); });
    return () => { alive = false; };
  }, []);

  if (!enabled) return null;

  const suggest = async () => {
    setError('');
    setDraft(null);
    setLoading(true);
    try {
      const result = await aiApi.tripDraft(text);
      const clean: TripDraft = {};
      for (const key of DRAFT_KEYS) if (key in result.draft) (clean as Record<string, unknown>)[key] = result.draft[key];
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
    <section className="card p-5 space-y-3" aria-labelledby="ai-title">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-surface-700" aria-hidden="true" />
        <h2 id="ai-title" className="text-lg font-semibold text-surface-900">Preencher com IA</h2>
      </div>
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
          <ul className="divide-y divide-surface-200 border border-surface-200 rounded-lg">
            {rows.map(r => (
              <li key={r.key} className="p-3">
                <label className="checkbox-label items-start">
                  <input type="checkbox" className="checkbox-input mt-1" checked={checked.has(r.key)} onChange={() => toggle(r.key)} />
                  <span className="text-sm min-w-0">
                    <span className="font-semibold text-surface-900">{r.label}{r.hasCurrent ? ' (já preenchido — marque para substituir)' : ''}</span>
                    <span className="block text-surface-600 break-words">Atual: {r.current}</span>
                    <span className="block text-surface-900 break-words">Sugerido: {r.suggested}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button variant="primary" onClick={apply} disabled={checked.size === 0}>Usar selecionados ({checked.size})</Button>
        </div>
      )}
    </section>
  );
}
