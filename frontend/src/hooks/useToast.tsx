import React, { createContext, useContext, useRef, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface ToastFn {
  (type: Toast['type'], message: string): void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

interface ToastContextType {
  toast: ToastFn;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};

// Pure helper (no React) so toast.success/.error/.info keep working for
// every call site that does `const { toast } = useToast(); toast.success(...)`.
export const createToastApi = (
  showToast: (type: Toast['type'], message: string) => void
): ToastFn =>
  Object.assign(showToast, {
    success: (msg: string) => showToast('success', msg),
    error: (msg: string) => showToast('error', msg),
    info: (msg: string) => showToast('info', msg),
  });

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const showToast = (type: Toast['type'], message: string) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const toast = createToastApi(showToast);

  return (
    <ToastContext.Provider value={{
      toast,
      success: toast.success,
      error: toast.error,
      info: toast.info,
    }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-slide-up ${
              t.type === 'success' ? 'toast-success' :
              t.type === 'error' ? 'toast-error' : 'toast-info'
            }`}
            role="alert"
            aria-live="polite"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
