/**
 * Verificação preliminar para orientar a interface. Não autoriza nem inicia uma
 * publicação: o futuro serviço de envio deverá validar novamente a conta, a
 * versão revisada, as permissões, o formato e a integridade da mídia.
 */
export type PublicationIssue =
  | 'UNSUPPORTED_PLATFORM'
  | 'UNSUPPORTED_FORMAT'
  | 'ACCOUNT_DISCONNECTED'
  | 'REVIEW_REQUIRED'
  | 'CAPTION_REQUIRED'
  | 'MEDIA_REQUIRED'
  | 'MEDIA_UNAVAILABLE';

export interface PublicationPreflightInput {
  platform: string;
  format: string;
  account: { platform: string; status: string } | null;
  currentVersion: number;
  approvedVersion: number | null;
  caption: string;
  media: { id: string; available: boolean; integrityVerified: boolean } | null;
}

export function socialPublicationPreflight(input: PublicationPreflightInput): { issues: PublicationIssue[] } {
  const issues: PublicationIssue[] = [];
  // O primeiro recorte previsto é uma imagem; outras plataformas e formatos
  // só entram após confirmação das regras e implementação do adaptador.
  if (input.platform !== 'INSTAGRAM' && input.platform !== 'FACEBOOK') issues.push('UNSUPPORTED_PLATFORM');
  if (input.format !== 'IMAGE') issues.push('UNSUPPORTED_FORMAT');
  if (!input.account || input.account.platform !== input.platform || input.account.status !== 'CONNECTED') issues.push('ACCOUNT_DISCONNECTED');
  if (!Number.isSafeInteger(input.currentVersion) || input.currentVersion < 1 || input.approvedVersion !== input.currentVersion) issues.push('REVIEW_REQUIRED');
  if (!input.caption.trim()) issues.push('CAPTION_REQUIRED');
  if (!input.media || !input.media.id.trim()) issues.push('MEDIA_REQUIRED');
  else if (!input.media.available || !input.media.integrityVerified) issues.push('MEDIA_UNAVAILABLE');
  return { issues };
}
