import React, { useEffect, useRef, useState } from 'react';
import Button from './Button';
import Field from './Field';

const formats = {
  quadrado: { label: 'Quadrado (1:1)', width: 1080, height: 1080 },
  retrato: { label: 'Retrato (4:5)', width: 1080, height: 1350 },
  story: { label: 'Story (9:16)', width: 1080, height: 1920 },
} as const;
type Format = keyof typeof formats;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Composição local. A foto, o texto e a imagem gerada não são enviados ao servidor. */
export default function SocialArtCreator() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<Format>('quadrado');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setReady(false);
    if (!file || !canvas.current) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled || !canvas.current) return;
      if (image.naturalWidth * image.naturalHeight > 40_000_000) {
        setError('A imagem tem dimensões muito grandes. Escolha uma foto menor.');
        return;
      }
      const target = canvas.current;
      const ctx = target.getContext('2d');
      if (!ctx) { setError('Não foi possível criar a prévia neste navegador.'); return; }
      const { width, height } = formats[format];
      target.width = width;
      target.height = height;
      // Preenche o formato escolhido mantendo as proporções, com corte central.
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      const shade = ctx.createLinearGradient(0, height * 0.35, 0, height);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'bottom';
      const words = title.trim().split(/\s+/).filter(Boolean);
      let fontSize = 64;
      let lines: string[] = [];
      do {
        ctx.font = `700 ${fontSize}px sans-serif`;
        lines = [];
        let line = '';
        for (const word of words) {
          const next = line ? `${line} ${word}` : word;
          if (ctx.measureText(next).width > width - 128 && line) { lines.push(line); line = word; }
          else line = next;
        }
        if (line) lines.push(line);
        if (lines.length <= 4 || fontSize <= 36) break;
        fontSize -= 4;
      } while (true);
      lines.forEach((text, index, displayed) => {
        ctx.fillText(text, 64, height - 90 - (displayed.length - 1 - index) * fontSize * 1.25, width - 128);
      });
      setError('');
      setReady(true);
    };
    image.onerror = () => { if (!cancelled) setError('Não foi possível abrir esta imagem. Escolha outra foto.'); };
    image.src = url;
    return () => { cancelled = true; URL.revokeObjectURL(url); };
  }, [file, title, format]);

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (next && (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > MAX_IMAGE_BYTES)) {
      setFile(null);
      setReady(false);
      setError('Escolha uma imagem JPEG, PNG ou WebP de até 10 MB.');
      event.target.value = '';
      return;
    }
    setError('');
    setFile(next);
  };

  const download = () => {
    if (!ready || !canvas.current) return;
    canvas.current.toBlob((blob) => {
      if (!blob) { setError('Não foi possível baixar a imagem.'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `overtrip-${format}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  return <section className="card space-y-4 p-5" aria-labelledby="social-art-title">
    <div><h2 id="social-art-title" className="text-lg font-semibold text-surface-900">Criar arte com uma foto</h2>
      <p className="mt-1 text-sm text-surface-600">Escolha uma foto, adicione um título e baixe a imagem no formato desejado. A composição acontece neste navegador.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="social-art-file" label="Foto" hint="JPEG, PNG ou WebP; até 10 MB.">
        <input id="social-art-file" className="input" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="social-art-file-hint" onChange={chooseFile} />
      </Field>
      <Field id="social-art-format" label="Formato">
        <select id="social-art-format" className="input" value={format} onChange={(event) => setFormat(event.target.value as Format)}>
          {Object.entries(formats).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
        </select>
      </Field>
    </div>
    <Field id="social-art-text" label="Título na imagem" hint="Até 100 caracteres. Confira o texto na prévia.">
      <input id="social-art-text" className="input" value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} aria-describedby="social-art-text-hint" />
    </Field>
    {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    <div className="max-w-sm rounded-xl bg-surface-100 p-2">
      {file ? <canvas ref={canvas} className="block h-auto w-full rounded-lg" role="img" aria-label={`Prévia da arte ${formats[format].label}${title ? `, com o título ${title}` : ', sem título'}`} /> : <p className="p-8 text-center text-sm text-surface-600">Selecione uma foto para visualizar a arte.</p>}
    </div>
    <Button variant="primary" onClick={download} disabled={!ready}>Baixar imagem PNG</Button>
  </section>;
}
