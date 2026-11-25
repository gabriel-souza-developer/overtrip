import React, { useEffect, useId, useRef, useState } from 'react';
import type { DocumentApi, ExtractedDocumentImage, TripDocument, UploadedMedia } from '../api';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import { buildSuggestionRows, type DraftKey, type SuggestionRow, type TripDraft } from '../lib/aiDraft';
import type { DocumentSuggestions } from '../api';

interface Props {
  tripId: string;
  // Operador legado passa documentApi (api/index.ts); o painel de empresa
  // passa createOrganizationDocumentApi(organizationId) — mesma interface,
  // isolamento por empresa é só do lado do servidor.
  api: DocumentApi;
  form: Record<string, unknown>;
  defaults: Record<string, unknown>;
  onApply: (draft: TripDraft, chosen: DraftKey[], overwrite: DraftKey[]) => void;
  // Só chamado quando api.importImage existe (painel de empresa). Mesmo
  // contrato do onAdd de ImageUploader.tsx: preenche o formulário, nunca
  // salva ou publica a viagem por conta própria.
  onImportPhoto?: (media: UploadedMedia, alt: string) => void;
}

const extractionLabels: Record<string, string> = {
  PENDING: 'Aguardando extração', PROCESSING: 'Extraindo texto', READY: 'Pronto para análise',
  FAILED: 'Não foi possível extrair texto', SKIPPED: 'Extração não iniciada',
};

export default function TripDocuments({ tripId, api, form, defaults, onApply, onImportPhoto }: Props) {
  const [documents, setDocuments] = useState<TripDocument[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<TripDocument | null>(null);
  const [suggestions, setSuggestions] = useState<DocumentSuggestions | null>(null);
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [checked, setChecked] = useState<Set<DraftKey>>(new Set());
  // Fotos extraídas do PDF: nunca persistidas até a pessoa escolher uma e
  // confirmar o texto alternativo (mesma exigência de ImageUploader.tsx).
  const [images, setImages] = useState<ExtractedDocumentImage[] | null>(null);
  const [imagesDocId, setImagesDocId] = useState<string | null>(null);
  const [pickedImage, setPickedImage] = useState<number | null>(null);
  const [imageAlt, setImageAlt] = useState('');
  const altRef = useRef<HTMLInputElement>(null);
  const importingRef = useRef(false);
  const altId = useId();
  useEffect(() => { if (pickedImage !== null) altRef.current?.focus(); }, [pickedImage]);
  const refresh = async () => setDocuments(await api.list(tripId));
  useEffect(() => { refresh().catch(() => setError('Não foi possível carregar os documentos.')); }, [tripId]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  };
  const closeImages = () => { setImages(null); setImagesDocId(null); setPickedImage(null); setImageAlt(''); };
  const importPickedImage = async () => {
    const alt = imageAlt.trim();
    if (busy || importingRef.current || !alt || pickedImage === null || !imagesDocId || !api.importImage || !onImportPhoto) return;
    importingRef.current = true;
    try {
      await run(async () => {
        const media = await api.importImage!(tripId, imagesDocId, pickedImage);
        onImportPhoto(media, alt);
        closeImages();
      });
    } finally { importingRef.current = false; }
  };
  return <section className="card p-5 space-y-3" aria-labelledby="documents-title">
    <h2 id="documents-title" className="text-lg font-semibold">PDFs do roteiro</h2>
    <p className="hint">Envie até cinco arquivos PDF, com no máximo 10 MiB cada. Eles são removidos após 30 dias.</p>
    <p className="alert-info" role="note">Ao pedir sugestões, o texto do PDF será enviado ao provedor de IA configurado. No plano gratuito do Google, ele pode ser usado para melhorar seus produtos. Não envie dados pessoais de clientes.</p>
    {error && <p className="text-red-700" role="alert">{error}</p>}
    <label htmlFor="trip-document" className="block">Adicionar PDF</label>
    <input id="trip-document" type="file" accept="application/pdf,.pdf" disabled={busy || documents.length >= 5} onChange={e => {
      const input = e.currentTarget; const file = input.files?.[0]; input.value = '';
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { setError('O PDF deve ter até 10 MiB.'); return; }
      void run(() => api.upload(tripId, file));
    }} />
    <Button small disabled={busy} onClick={() => void run(async () => {})}>Atualizar lista</Button>
    {documents.length === 0 && <p className="hint">Nenhum documento anexado.</p>}
    <ul className="space-y-2">{documents.map(doc => <li key={doc.id} className="flex flex-wrap items-center gap-2">
      <span className="break-all">{doc.originalFilename}</span>
      <span className="hint">Expira em {new Date(doc.retentionUntil).toLocaleDateString('pt-BR')}</span>
      <span className="hint">{extractionLabels[doc.extractionStatus] ?? 'Estado desconhecido'}</span>
      {doc.extractionStatus === 'READY' && <Button small disabled={busy} onClick={() => void run(async () => {
        setSuggestions(null); setRows([]); setChecked(new Set());
        const result = await api.suggestions(tripId, doc.id);
        const next = buildSuggestionRows(form, result.draft as TripDraft, defaults).filter(row => !!result.sources[row.key]);
        setSuggestions(result); setRows(next);
        if (!next.length) setError('Não encontrei sugestões novas com origem verificável neste documento.');
      })}>Sugerir campos</Button>}
      {doc.extractionStatus === 'READY' && api.previewImages && <Button small disabled={busy} onClick={() => void run(async () => {
        closeImages(); setImagesDocId(doc.id);
        const result = await api.previewImages!(tripId, doc.id);
        setImages(result.images);
        if (!result.images.length) setError('Nenhuma foto foi encontrada neste PDF.');
      })}>Ver fotos do PDF</Button>}
      <Button small disabled={busy} onClick={() => void run(() => api.download(tripId, doc))}>Baixar</Button>
      <Button small variant="danger" disabled={busy} onClick={() => setSelected(doc)}>Excluir</Button>
    </li>)}</ul>
    {suggestions && suggestions.warnings.length > 0 && <ul className="alert-info list-disc pl-5" role="status">{suggestions.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    {images && images.length > 0 && <div className="space-y-3" aria-live="polite">
      <p className="font-semibold">Fotos encontradas no PDF</p>
      <p className="hint">Escolha uma foto para importar como foto da viagem. Nada é salvo até você confirmar o texto alternativo e importar.</p>
      <ul className="flex flex-wrap gap-2" role="list">{images.map(image => <li key={image.index}>
        <button type="button" disabled={busy}
          className={`block rounded-lg border-2 p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${pickedImage === image.index ? 'border-primary-500' : 'border-surface-200'}`}
          aria-pressed={pickedImage === image.index}
          aria-label={`Selecionar foto da página ${image.page} (${image.width}×${image.height} px)`}
          onClick={() => { setPickedImage(image.index); setImageAlt(''); }}>
          <img src={image.dataUrl} alt="" className="h-20 w-20 object-cover rounded bg-surface-100" />
        </button>
      </li>)}</ul>
      {pickedImage !== null && <div className="rounded-lg border border-dashed border-surface-300 p-3 space-y-2">
        <div className="flex flex-wrap items-start gap-3">
          <img src={images.find(image => image.index === pickedImage)?.dataUrl} alt="" className="w-20 h-20 object-cover rounded bg-surface-100" />
          <div className="flex-1 min-w-[12rem] space-y-1">
            <label htmlFor={altId} className="label">O que aparece nesta foto? <span className="text-red-700">(obrigatório)</span></label>
            <input id={altId} ref={altRef} type="text" className="input" value={imageAlt} aria-required="true"
              onChange={e => setImageAlt(e.target.value)} placeholder="Ex.: Grupo no mirante"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void importPickedImage(); } }} />
            <p className="hint">Esse texto ajuda pessoas que usam leitor de tela a entender a imagem.</p>
            <div className="flex flex-wrap gap-2">
              <Button small variant="primary" disabled={busy || !imageAlt.trim()} onClick={() => void importPickedImage()}>Importar esta foto</Button>
              <Button small disabled={busy} onClick={() => { setPickedImage(null); setImageAlt(''); }}>Cancelar</Button>
            </div>
          </div>
        </div>
      </div>}
    </div>}
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
    <ConfirmDialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }} title="Excluir documento?" description={`O arquivo ${selected?.originalFilename ?? ''} será removido.`} confirmLabel="Excluir" busy={busy} onConfirm={() => { if (selected) void run(async () => { await api.remove(tripId, selected.id); if (Object.values(suggestions?.sources ?? {}).some(source => source.documentId === selected.id)) { setSuggestions(null); setRows([]); setChecked(new Set()); } if (imagesDocId === selected.id) closeImages(); setSelected(null); }); }} />
  </section>;
}
