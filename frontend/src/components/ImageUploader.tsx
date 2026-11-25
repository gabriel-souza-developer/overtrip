import React, { useEffect, useId, useRef, useState } from 'react';
import { ClipboardPaste, Upload } from 'lucide-react';
import Button from './Button';
import { mediaApi, MEDIA_ACCEPTED_TYPES, MEDIA_MAX_BYTES, type UploadedMedia } from '../api';

type MediaType = 'image' | 'video';
type SelectedMedia = { id: number; name: string; type: MediaType } & (
  | { kind: 'uploading'; preview?: string; progress: number }
  | { kind: 'ready'; asset: UploadedMedia; alt: string }
  | { kind: 'error'; message: string }
);

interface ImageUploaderProps {
  onAdd: (item: { src: string; alt: string; previewSrc?: string; type: MediaType }) => void;
  onPendingChange?: (pending: boolean) => void;
  idPrefix: string;
  endpoint?: string;
  maxPhotos?: number;
  allowVideo?: boolean;
}

/** Escolhe a primeira imagem colada (print, foto copiada do navegador etc.). */
export function imageFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return Array.from(data.files ?? []).find((file) => file.type.startsWith('image/')) ?? null;
}

/** Recusa no navegador o que a API recusaria, com a mesma mensagem clara. */
export function checkImageFile(file: { type: string; size: number }): string {
  if (!(MEDIA_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return 'Formato não aceito. Envie uma foto JPEG, PNG ou WebP.';
  if (file.size > MEDIA_MAX_BYTES) return 'A imagem passa de 15 MiB. Reduza o tamanho e tente de novo.';
  return '';
}

export default function ImageUploader({ onAdd, onPendingChange, idPrefix, endpoint = '/media', maxPhotos = Infinity, allowVideo = false }: ImageUploaderProps) {
  const [photos, setPhotos] = useState<SelectedMedia[]>([]);
  const [notice, setNotice] = useState('');
  const nextId = useRef(0);
  const uploads = useRef(new Map<number, { controller: AbortController; preview?: string }>());
  const altRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const fileId = `${idPrefix}-file`;
  const pendingCount = photos.filter((photo) => photo.kind !== 'error').length;
  const pending = pendingCount > 0;
  const pendingCallback = useRef(onPendingChange);
  const notifiedPending = useRef(false);
  const singleReadyId = photos.length === 1 && photos[0].kind === 'ready' ? photos[0].id : null;

  useEffect(() => { pendingCallback.current = onPendingChange; }, [onPendingChange]);
  useEffect(() => {
    if (notifiedPending.current === pending) return;
    notifiedPending.current = pending;
    pendingCallback.current?.(pending);
  }, [pending]);
  useEffect(() => {
    const activeUploads = uploads.current;
    return () => {
      for (const { controller, preview } of activeUploads.values()) {
        controller.abort();
        if (preview) URL.revokeObjectURL(preview);
      }
      activeUploads.clear();
      if (notifiedPending.current) pendingCallback.current?.(false);
    };
  }, []);
  useEffect(() => {
    if (singleReadyId !== null) altRef.current?.focus();
  }, [singleReadyId]);

  const updatePhoto = (id: number, update: (photo: SelectedMedia) => SelectedMedia) => {
    setPhotos((current) => current.map((photo) => photo.id === id ? update(photo) : photo));
  };

  const releaseUpload = (id: number) => {
    const upload = uploads.current.get(id);
    if (!upload) return;
    uploads.current.delete(id);
    if (upload.preview) URL.revokeObjectURL(upload.preview);
  };

  const send = (files: File[]) => {
    setNotice('');
    let available = maxPhotos - pendingCount;
    for (const file of files) {
      const id = nextId.current++;
      const type = allowVideo && file.type === 'video/mp4' ? 'video' : 'image';
      const item = { id, name: file.name, type } as const;
      const formatProblem = type === 'video'
        ? (file.size > MEDIA_MAX_BYTES ? 'O vídeo passa de 15 MiB. Reduza o tamanho e tente de novo.' : '')
        : checkImageFile(file);
      const limitProblem = available <= 0 ? 'Limite de arquivos atingido. Libere espaço e tente novamente.' : '';
      const problem = formatProblem || limitProblem;
      if (problem) {
        setPhotos((current) => [...current, { ...item, kind: 'error', message: problem }]);
        continue;
      }
      available -= 1;
      const controller = new AbortController();
      const preview = type === 'image' ? URL.createObjectURL(file) : undefined;
      uploads.current.set(id, { controller, preview });
      setPhotos((current) => [...current, { ...item, kind: 'uploading', preview, progress: 0 }]);
      void mediaApi.uploadTo(endpoint, file, (progress) => {
        updatePhoto(id, (photo) => photo.kind === 'uploading' ? { ...photo, progress } : photo);
      }, controller.signal).then((asset) => {
        if (controller.signal.aborted) return;
        updatePhoto(id, () => ({ ...item, kind: 'ready', asset, alt: '' }));
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.';
        updatePhoto(id, () => ({ ...item, kind: 'error', message }));
      }).finally(() => releaseUpload(id));
    }
  };

  const remove = (id: number) => {
    uploads.current.get(id)?.controller.abort();
    releaseUpload(id);
    setPhotos((current) => current.filter((photo) => photo.id !== id));
  };

  const confirm = (photo: Extract<SelectedMedia, { kind: 'ready' }>) => {
    const alt = photo.alt.trim();
    if (!alt) return;
    // src é o caminho canônico salvo. previewSrc também permite conferir a foto
    // recém-enviada em empresas cuja mídia ainda não está disponível no site público.
    onAdd({ src: photo.asset.src, alt, previewSrc: photo.asset.previewSrc, type: photo.type });
    remove(photo.id);
    setNotice(photo.type === 'video'
      ? 'Vídeo adicionado ao formulário. Salve para confirmar a alteração.'
      : 'Foto adicionada ao formulário. Salve para confirmar a alteração.');
  };

  const onPaste = (event: React.ClipboardEvent) => {
    const file = imageFromClipboard(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    send([file]);
  };

  return (
    <div className="rounded-lg border border-dashed border-surface-300 p-3 space-y-2" data-testid={`${idPrefix}-uploader`}>
      <div className="flex flex-wrap items-center gap-2">
        <input id={fileId} type="file" multiple className="sr-only peer" accept={[...MEDIA_ACCEPTED_TYPES, ...(allowVideo ? ['video/mp4'] : [])].join(',')} aria-describedby={hintId}
          onChange={(event) => {
            const input = event.currentTarget;
            const files = Array.from(input.files ?? []);
            input.value = '';
            if (files.length > 0) send(files);
          }} />
        <label htmlFor={fileId} className="btn-secondary cursor-pointer inline-flex items-center gap-2 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-600">
          <Upload className="w-4 h-4" aria-hidden="true" /> {allowVideo ? 'Enviar fotos ou vídeos' : 'Enviar fotos'}
        </label>
        <div tabIndex={0} role="textbox" aria-label="Colar imagem da área de transferência" aria-describedby={hintId} onPaste={onPaste}
          className="flex-1 min-w-[12rem] rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-600 focus:outline-none focus:ring-2 focus:ring-primary-600 inline-flex items-center gap-2">
          <ClipboardPaste className="w-4 h-4" aria-hidden="true" /> Clique aqui e cole uma imagem (Ctrl+V)
        </div>
        <p id={hintId} className="hint w-full">JPEG, PNG ou WebP{allowVideo && ', ou vídeo MP4'}, até 15 MiB por arquivo. As fotos são giradas e limpas (sem localização e dados da câmera) antes de salvar.</p>
      </div>
      {photos.length > 0 && (
        <ul className="space-y-3">
          {photos.map((photo) => {
            const suffix = photo.id === 0 ? '' : `-${photo.id}`;
            const nameId = `${idPrefix}-name${suffix}`;
            const progressId = `${idPrefix}-progress${suffix}`;
            const altId = `${idPrefix}-alt${suffix}`;
            const isVideo = photo.type === 'video';
            const confirmation = isVideo ? 'Usar este vídeo' : 'Usar esta foto';
            return (
              <li key={photo.id} aria-labelledby={nameId} className="rounded-md border border-surface-200 p-3 space-y-2">
                <p id={nameId} className="text-sm text-surface-700 break-all">Arquivo selecionado: {photo.name}</p>
                {photo.kind === 'error' && (
                  <div className="flex items-start justify-between gap-3">
                    <p className="field-error" role="alert">{photo.message}</p>
                    <Button small onClick={() => remove(photo.id)}>Dispensar</Button>
                  </div>
                )}
                {photo.kind === 'uploading' && (
                  <div className="flex items-center gap-3">
                    {photo.preview && <img src={photo.preview} alt="" className="w-16 h-16 object-cover rounded bg-surface-100" />}
                    <div className="flex-1 space-y-1">
                      <label htmlFor={progressId} className="text-sm">Enviando {isVideo ? 'vídeo' : 'foto'}… {Math.round(photo.progress * 100)}%</label>
                      <progress id={progressId} className="w-full accent-primary-500" max={1} value={photo.progress} />
                    </div>
                    <Button small onClick={() => remove(photo.id)}>Cancelar</Button>
                  </div>
                )}
                {photo.kind === 'ready' && (
                  <div className="flex flex-wrap items-start gap-3">
                    {isVideo
                      ? <video src={photo.asset.previewSrc ?? photo.asset.src} controls preload="metadata" className="w-40 rounded bg-surface-100" />
                      : <img src={photo.asset.previewSrc ?? photo.asset.src} alt="" className="w-20 h-20 object-cover rounded bg-surface-100" />}
                    <div className="flex-1 min-w-[12rem] space-y-1">
                      <p role="status" className="text-sm text-surface-700">{isVideo ? 'Vídeo enviado. Conte o que aparece nele' : 'Foto enviada. Conte o que aparece nela'} e clique em “{confirmation}”.</p>
                      <label htmlFor={altId} className="label">{isVideo ? 'O que aparece neste vídeo?' : 'O que aparece nesta foto?'} <span className="text-red-700">(obrigatório)</span></label>
                      <input id={altId} ref={singleReadyId === photo.id ? altRef : undefined} type="text" className="input" value={photo.alt} aria-required="true"
                        onChange={(event) => {
                          const alt = event.currentTarget.value;
                          updatePhoto(photo.id, (current) => current.kind === 'ready' ? { ...current, alt } : current);
                        }} placeholder="Ex.: Grupo atravessando o rio na trilha"
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); confirm(photo); } }} />
                      <p className="hint">Esse texto ajuda pessoas que usam leitor de tela a entender {isVideo ? 'o vídeo' : 'a imagem'}.</p>
                      <div className="flex gap-2">
                        <Button small variant="primary" disabled={!photo.alt.trim()} onClick={() => confirm(photo)}>{confirmation}</Button>
                        <Button small onClick={() => remove(photo.id)}>Descartar</Button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {notice && <p role="status" className="text-sm text-surface-700">{notice}</p>}
    </div>
  );
}
