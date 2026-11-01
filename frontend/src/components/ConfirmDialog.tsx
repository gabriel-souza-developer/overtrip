import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import Button from './Button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
}

/** Pergunta antes de uma ação sem volta (excluir) ou com efeito no site (tirar do ar). */
export default function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, busyLabel = 'Aguarde...', busy = false, danger = true, onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content max-w-md p-6">
          <div className="flex gap-4">
            <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${danger ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700'}`}>
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <Dialog.Title className="text-lg font-semibold text-surface-900">{title}</Dialog.Title>
              <Dialog.Description className="text-sm text-surface-600 mt-1">{description}</Dialog.Description>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={busy}>Cancelar</Button>
            </Dialog.Close>
            <Button variant={danger ? 'danger' : 'primary'} loading={busy} loadingText={busyLabel} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
