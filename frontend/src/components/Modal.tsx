import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Botões do rodapé (ficam sempre visíveis, mesmo com o conteúdo rolando). */
  footer?: React.ReactNode;
  widthClass?: string;
}

/** Janela acessível (Radix): foco preso, Esc fecha, leitor de tela anuncia o título. */
export default function Modal({ open, onOpenChange, title, description, children, footer, widthClass = 'max-w-lg' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog-content ${widthClass}`} aria-describedby={description ? undefined : undefined}>
          <div className="px-5 py-4 border-b border-surface-200 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-surface-900">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-sm text-surface-600 mt-0.5">{description}</Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close className="btn-icon -mr-2 -mt-1" aria-label="Fechar">
              <X className="w-5 h-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
          {footer ? <div className="px-5 py-4 border-t border-surface-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
