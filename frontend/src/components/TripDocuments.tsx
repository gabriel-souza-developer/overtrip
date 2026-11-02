import React, { useEffect, useState } from 'react';
import { documentApi, type TripDocument } from '../api';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import { buildSuggestionRows, type DraftKey, type SuggestionRow, type TripDraft } from '../lib/aiDraft';
import type { DocumentSuggestions } from '../api';

interface Props {
  tripId: string;
  form: Record<string, unknown>;
  defaults: Record<string, unknown>;
  onApply: (draft: TripDraft, chosen: DraftKey[], overwrite: DraftKey[]) => void;
}

const extractionLabels: Record<string, string> = {
  PENDING: 'Aguardando extração', PROCESSING: 'Extraindo texto', READY: 'Pronto para análise',
  FAILED: 'Não foi possível extrair texto', SKIPPED: 'Extração não iniciada',
};

export default function TripDocuments({ tripId, form, defaults, onApply }: Props) {
  const [documents, setDocuments] = useState<TripDocument[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<TripDocument | null>(null);
  const [suggestions, setSuggestions] = useState<DocumentSuggestions | null>(null);
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [checked, setChecked] = useState<Set<DraftKey>>(new Set());
  const refresh = async () => setDocuments(await documentApi.list(tripId));
  useEffect(() => { refresh().catch(() => setError('Não foi possível carregar os documentos.')); }, [tripId]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  };
  return <section className="card p-5 space-y-3" aria-labelledby="documents-title">
    <h2 id="documents-title" className="text-lg font-semibold">Documentos privados</h2>
    <p className="hint">PDFs de até 10 MiB, até cinco por viagem. São excluídos após 30 dias. Atualize a lista para acompanhar a extração.</p>
    <p className="alert-info" role="note">Ao pedir sugestões, o texto do PDF será enviado ao provedor de IA configurado. No plano gratuito do Google, ele pode ser usado para melhorar seus produtos. Não envie dados pessoais de clientes.</p>
    {error && <p className="text-red-700" role="alert">{error}</p>}
    <label htmlFor="trip-document" className="block">Adicionar PDF</label>
    <input id="trip-document" type="file" accept="application/pdf,.pdf" disabled={busy || documents.length >= 5} onChange={e => {
      const input = e.currentTarget; const file = input.files?.[0]; input.value = '';
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { setError('O PDF deve ter até 10 MiB.'); return; }
      void run(() => documentApi.upload(tripId, file));
    }} />
    <Button small disabled={busy} onClick={() => void run(async () => {})}>Atualizar lista</Button>
    {documents.length === 0 && <p className="hint">Nenhum documento anexado.</p>}
    <ul className="space-y-2">{documents.map(doc => <li key={doc.id} className="flex flex-wrap items-center gap-2">
      <span className="break-all">{doc.originalFilename}</span>
      <span className="hint">Expira em {new Date(doc.retentionUntil).toLocaleDateString('pt-BR')}</span>
      <span className="hint">{extractionLabels[doc.extractionStatus] ?? 'Estado desconhecido'}</span>
      {doc.extractionStatus === 'READY' && <Button small disabled={busy} onClick={() => void run(async () => {
        setSuggestions(null); setRows([]); setChecked(new Set());
        const result = await documentApi.suggestions(tripId, doc.id);
        const next = buildSuggestionRows(form, result.draft as TripDraft, defaults).filter(row => !!result.sources[row.key]);
        setSuggestions(result); setRows(next);
        if (!next.length) setError('Não encontrei sugestões novas com origem verificável neste documento.');
      })}>Sugerir campos</Button>}
      <Button small disabled={busy} onClick={() => void run(() => documentApi.download(tripId, doc))}>Baixar</Button>
      <Button small variant="danger" disabled={busy} onClick={() => setSelected(doc)}>Excluir</Button>
    </li>)}</ul>
    {suggestions && suggestions.warnings.length > 0 && <ul className="alert-info list-disc pl-5" role="status">{suggestions.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    {suggestions && rows.length > 0 && <div className="space-y-3" aria-live="polite">
      <p className="font-semibold">Revise as sugestões do documento</p>
      <p className="hint">Marque cada campo que deseja usar. A aplicação preenche o formulário; salve a viagem para confirmar.</p>
      <ul className="divide-y divide-surface-200 border border-surface-200 rounded-lg">{rows.map(row => {
        const source = suggestions.sources[row.key];
        return <li key={row.key} className="p-3"><label className="checkbox-label items-start">
          <input type="checkbox" className="checkbox-input mt-1" checked={checked.has(row.key)} onChange={() => setChecked(previous => {
            const next = new Set(previous); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next;
          })} />
          <span className="text-sm min-w-0"><span className="font-semibold">{row.label}{row.hasCurrent ? ' (já preenchido — marque para substituir)' : ''}</span>
            <span className="block break-words">Atual: {row.current}</span><span className="block break-words">Sugerido: {row.suggested}</span>
            <span className="block text-surface-600 break-words">{source.filename}, página {source.page}: “{source.excerpt}”</span>
          </span>
        </label></li>;
      })}</ul>
      <Button variant="primary" disabled={checked.size === 0} onClick={() => {
        const chosen = rows.filter(row => checked.has(row.key));
        onApply(suggestions.draft as TripDraft, chosen.map(row => row.key), chosen.filter(row => row.hasCurrent).map(row => row.key));
        setSuggestions(null); setRows([]); setChecked(new Set());
      }}>Usar selecionados ({checked.size})</Button>
    </div>}
    <ConfirmDialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }} title="Excluir documento?" description={`O arquivo ${selected?.originalFilename ?? ''} será removido.`} confirmLabel="Excluir" busy={busy} onConfirm={() => { if (selected) void run(async () => { await documentApi.remove(tripId, selected.id); if (Object.values(suggestions?.sources ?? {}).some(source => source.documentId === selected.id)) { setSuggestions(null); setRows([]); setChecked(new Set()); } setSelected(null); }); }} />
  </section>;
}
