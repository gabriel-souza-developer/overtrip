import { describe, expect, it } from 'vitest';
import { defaultWhatsappSchema, tripPresentationDefaultsSchema } from '../src/validators/index.js';
import { DEFAULT_TRIP_PRESENTATION, parseTripPresentationDefaults, parseWhatsapp } from '../src/services/settingsService.js';

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

describe('padrões de apresentação da viagem', () => {
  it('valida os valores que podem ser usados globalmente', () => {
    expect(tripPresentationDefaultsSchema.parse({ buttonLabel: 'Reservar', buttonClass: 'button-rust', priceUnit: 'por casal' }))
      .toEqual({ buttonLabel: 'Reservar', buttonClass: 'button-rust', priceUnit: 'por casal' });
    expect(() => tripPresentationDefaultsSchema.parse({ buttonLabel: '', buttonClass: 'button-neon', priceUnit: '' })).toThrow();
  });

  it('usa os padrões seguros quando a configuração persistida for inválida', () => {
    expect(parseTripPresentationDefaults(JSON.stringify({ buttonLabel: 'Reservar', buttonClass: 'button-rust', priceUnit: 'por casal' })))
      .toEqual({ buttonLabel: 'Reservar', buttonClass: 'button-rust', priceUnit: 'por casal' });
    expect(parseTripPresentationDefaults('{')).toEqual(DEFAULT_TRIP_PRESENTATION);
    expect(parseTripPresentationDefaults(null)).toEqual(DEFAULT_TRIP_PRESENTATION);
  });
});
