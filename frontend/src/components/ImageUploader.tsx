import React, { useEffect, useId, useRef, useState } from 'react';
import { ClipboardPaste, Upload } from 'lucide-react';
import Button from './Button';
import { mediaApi, MEDIA_ACCEPTED_TYPES, MEDIA_MAX_BYTES, type UploadedMedia } from '../api';

type State =
  | { kind: 'idle' }
  | { kind: 'uploading'; preview: string; progress: number }
  | { kind: 'ready'; asset: UploadedMedia };

/** Escolhe a primeira imagem colada (print, foto copiada do navegador etc.). */
export function imageFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  return Array.from(data.files ?? []).find((file) => file.type.startsWith('image/')) ?? null;
}

/** Recusa no navegador o que a API recusaria, com a mesma mensagem clara. */
export function checkImageFile(file: { type: string; size: number }): string {
  if (!(MEDIA_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return 'Formato não aceito. Envie uma foto JPEG, PNG ou WebP.';
  if (file.size > MEDIA_MAX_BYTES) return 'A imagem passa de 15 MiB. Reduza o tamanho e tente de novo.';
  return '';
}

/**
 * Envia uma foto (arquivo ou colada) e só a entrega ao formulário depois que
 * o texto alternativo for preenchido.
 */
export default function ImageUploader({ onAdd, idPrefix }: { onAdd: (item: { src: string; alt: string }) => void; idPrefix: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [alt, setAlt] = useState('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const altRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const fileId = `${idPrefix}-file`;
  const altId = `${idPrefix}-alt`;

  useEffect(() => () => abort.current?.abort(), []);
  const preview = useRef('');
  const dropPreview = () => { if (preview.current) URL.revokeObjectURL(preview.current); preview.current = ''; };
  useEffect(() => dropPreview, []);
  useEffect(() => { if (state.kind === 'ready') altRef.current?.focus(); }, [state.kind]);

  const send = async (file: File) => {
    const problem = checkImageFile(file);
    setError(problem);
    if (problem) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setAlt('');
    dropPreview();
    preview.current = URL.createObjectURL(file);
    setState({ kind: 'uploading', preview: preview.current, progress: 0 });
    try {
      const asset = await mediaApi.upload(file, (progress) => setState((s) => (s.kind === 'uploading' ? { ...s, progress } : s)), controller.signal);
      dropPreview();
      setState({ kind: 'ready', asset });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      dropPreview();
      setState({ kind: 'idle' });
      setError(e instanceof Error ? e.message : 'Não foi possível enviar a foto.');
    }
  };

  const reset = () => { abort.current?.abort(); dropPreview(); setState({ kind: 'idle' }); setAlt(''); };
  const confirm = () => {
    if (state.kind !== 'ready' || !alt.trim()) return;
    onAdd({ src: state.asset.src, alt: alt.trim() });
    reset();
  };

  const onPaste = (event: React.ClipboardEvent) => {
    const file = imageFromClipboard(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    void send(file);
  };

  return (
    <div className="rounded-lg border border-dashed border-surface-300 p-3 space-y-2" data-testid={`${idPrefix}-uploader`}>
      {state.kind === 'idle' && (
        <div className="flex flex-wrap items-center gap-2">
          <input id={fileId} type="file" className="sr-only peer" accept={MEDIA_ACCEPTED_TYPES.join(',')} aria-describedby={hintId}
            onChange={(e) => { const input = e.currentTarget; const file = input.files?.[0]; input.value = ''; if (file) void send(file); }} />
          <label htmlFor={fileId} className="btn-secondary cursor-pointer inline-flex items-center gap-2 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500">
            <Upload className="w-4 h-4" aria-hidden="true" /> Enviar foto
          </label>
          <div tabIndex={0} role="textbox" aria-label="Colar imagem da área de transferência" aria-describedby={hintId} onPaste={onPaste}
            className="flex-1 min-w-[12rem] rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-600 focus:outline-none focus:ring-2 focus:ring-primary-500 inline-flex items-center gap-2">
            <ClipboardPaste className="w-4 h-4" aria-hidden="true" /> Clique aqui e cole uma imagem (Ctrl+V)
          </div>
          <p id={hintId} className="hint w-full">JPEG, PNG ou WebP, até 15 MiB. A foto é girada e limpa (sem localização e dados da câmera) antes de salvar.</p>
        </div>
      )}
      {state.kind === 'uploading' && (
        <div className="flex items-center gap-3">
          <img src={state.preview} alt="" className="w-16 h-16 object-cover rounded bg-surface-100" />
          <div className="flex-1 space-y-1">
            <label htmlFor={`${idPrefix}-progress`} className="text-sm">Enviando foto… {Math.round(state.progress * 100)}%</label>
            <progress id={`${idPrefix}-progress`} className="w-full accent-primary-600" max={1} value={state.progress} />
          </div>
          <Button small onClick={reset}>Cancelar</Button>
        </div>
      )}
      {state.kind === 'ready' && (
        <div className="flex flex-wrap items-start gap-3">
          <img src={state.asset.src} alt="" className="w-20 h-20 object-cover rounded bg-surface-100" />
          <div className="flex-1 min-w-[12rem] space-y-1">
            <label htmlFor={altId} className="label">Descrição da foto <span className="text-red-700">(obrigatória)</span></label>
            <input id={altId} ref={altRef} type="text" className="input" value={alt} aria-required="true"
              onChange={(e) => setAlt(e.target.value)} placeholder="Ex.: Grupo atravessando o rio na trilha"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }} />
            <p className="hint">Descreva o que aparece: ajuda quem usa leitor de tela e o Google.</p>
            <div className="flex gap-2">
              <Button small variant="primary" disabled={!alt.trim()} onClick={confirm}>Usar esta foto</Button>
              <Button small onClick={reset}>Descartar</Button>
            </div>
          </div>
        </div>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
