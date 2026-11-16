import { describe, expect, it } from 'vitest';
import { socialPublicationPreflight, type PublicationPreflightInput } from '../src/services/socialPublicationPreflight.js';

const valid = (): PublicationPreflightInput => ({
  platform: 'INSTAGRAM', format: 'IMAGE', account: { platform: 'INSTAGRAM', status: 'CONNECTED' },
  currentVersion: 3, approvedVersion: 3, caption: 'Conheça a próxima viagem',
  media: { id: 'media-1', available: true, integrityVerified: true },
});

describe('pré-verificação informativa de publicação', () => {
  it('identifica informações presentes sem autorizar um envio', () => {
    expect(socialPublicationPreflight(valid())).toEqual({ issues: [] });
  });

  it('exige nova revisão quando a versão mudou ou é inválida', () => {
    expect(socialPublicationPreflight({ ...valid(), approvedVersion: 2 }).issues).toContain('REVIEW_REQUIRED');
    expect(socialPublicationPreflight({ ...valid(), currentVersion: 0, approvedVersion: 0 }).issues).toContain('REVIEW_REQUIRED');
  });

  it('informa legenda e imagem ausentes e não confunde integridade desconhecida com sucesso', () => {
    expect(socialPublicationPreflight({ ...valid(), caption: ' ', media: null }).issues).toEqual(['CAPTION_REQUIRED', 'MEDIA_REQUIRED']);
    expect(socialPublicationPreflight({ ...valid(), media: { id: 'x', available: true, integrityVerified: false } }).issues).toContain('MEDIA_UNAVAILABLE');
  });

  it('recusa conta desconectada ou pertencente a outra rede e formatos não implementados', () => {
    expect(socialPublicationPreflight({ ...valid(), account: { platform: 'FACEBOOK', status: 'CONNECTED' } }).issues).toContain('ACCOUNT_DISCONNECTED');
    expect(socialPublicationPreflight({ ...valid(), account: null }).issues).toContain('ACCOUNT_DISCONNECTED');
    expect(socialPublicationPreflight({ ...valid(), platform: 'TIKTOK', format: 'VIDEO' }).issues).toEqual(['UNSUPPORTED_PLATFORM', 'UNSUPPORTED_FORMAT', 'ACCOUNT_DISCONNECTED']);
  });
});
