// Espelha a regra da API (src/controllers/tripController.ts): só o perfil 'admin' altera a situação da viagem.
export function canChangeTripStatus(role: string | undefined): boolean {
  return role === 'admin';
}
