import React from 'react';
import { RefreshCw } from 'lucide-react';
import Button from './Button';

export default function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert-error flex flex-col sm:flex-row sm:items-center gap-3" role="alert">
      <p className="flex-1">{message}</p>
      {onRetry ? <Button small icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />} onClick={onRetry}>Tentar de novo</Button> : null}
    </div>
  );
}
