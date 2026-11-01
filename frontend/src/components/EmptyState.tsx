import React from 'react';

/** Estado vazio útil: diz o que está acontecendo e o que fazer a seguir. */
export default function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4">
      <div className="w-12 h-12 rounded-full bg-surface-100 text-surface-600 flex items-center justify-center mb-3" aria-hidden="true">{icon}</div>
      <p className="font-semibold text-surface-900">{title}</p>
      {text ? <p className="text-sm text-surface-600 mt-1 max-w-sm">{text}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
