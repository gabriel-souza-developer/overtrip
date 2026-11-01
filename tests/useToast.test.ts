import { describe, it, expect, vi } from 'vitest';
import { createToastApi } from '../frontend/src/hooks/useToast.tsx';

describe('createToastApi', () => {
  it('é chamável diretamente como toast(type, message)', () => {
    const showToast = vi.fn();
    const toast = createToastApi(showToast);

    toast('success', 'Viagem criada');

    expect(showToast).toHaveBeenCalledWith('success', 'Viagem criada');
  });

  it('expõe toast.success/.error/.info como métodos, igual todo call site do painel usa', () => {
    const showToast = vi.fn();
    const toast = createToastApi(showToast);

    expect(typeof toast.success).toBe('function');
    expect(typeof toast.error).toBe('function');
    expect(typeof toast.info).toBe('function');

    toast.success('ok');
    toast.error('falhou');
    toast.info('aviso');

    expect(showToast).toHaveBeenNthCalledWith(1, 'success', 'ok');
    expect(showToast).toHaveBeenNthCalledWith(2, 'error', 'falhou');
    expect(showToast).toHaveBeenNthCalledWith(3, 'info', 'aviso');
  });
});
