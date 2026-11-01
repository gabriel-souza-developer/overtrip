import React from 'react';
import { ImageOff } from 'lucide-react';
import { resolveAssetSrc } from '../lib/assetUrl';

/** Miniatura que mostra um ícone se a foto não carregar (link errado) em vez de ficar quebrada. */
export default function ImageThumb({ src, className = 'w-12 h-12' }: { src: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  if (!src.trim() || failed) {
    return <div className={`${className} rounded bg-surface-100 text-surface-500 flex items-center justify-center shrink-0`} aria-hidden="true"><ImageOff className="w-5 h-5" /></div>;
  }
  return <img src={resolveAssetSrc(src.trim())} alt="" className={`${className} object-cover rounded bg-surface-100 shrink-0`} loading="lazy" onError={() => setFailed(true)} />;
}
