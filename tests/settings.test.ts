import { describe, expect, it } from 'vitest';
import { defaultWhatsappSchema } from '../src/validators/index.js';
import { parseWhatsapp } from '../src/services/settingsService.js';

describe('configuração de WhatsApp', () => {
  it('aceita somente número com DDI e DDD', () => {
    expect(defaultWhatsappSchema.parse({ defaultWhatsapp: '5545999999999' })).toEqual({ defaultWhatsapp: '5545999999999' });
    expect(() => defaultWhatsappSchema.parse({ defaultWhatsapp: '55459999999' })).toThrow();
    expect(() => defaultWhatsappSchema.parse({ defaultWhatsapp: '+5545999999999' })).toThrow();
  });

  it('lê o valor JSON persistido e ignora formatos antigos ou inválidos', () => {
    expect(parseWhatsapp(JSON.stringify('5545999999999'))).toBe('5545999999999');
    expect(parseWhatsapp('5545999999999')).toBeNull();
    expect(parseWhatsapp('{')).toBeNull();
    expect(parseWhatsapp(null)).toBeNull();
  });
});
