import 'dotenv/config';
import { createReservationIntakeApp } from './reservationIntakeApp.js';
import { purgeExpiredReservationIntake } from './services/reservationIntake.js';

const secret = process.env.RESERVATION_INTAKE_SECRET;
const readSecret = process.env.ASSISTANT_SERVICE_SECRET;
const port = Number(process.env.RESERVATION_INTAKE_PORT ?? '3011');
const valid = (value: string | undefined) => Boolean(value) && /^[a-fA-F0-9]{64}$/.test(value!);

if (!valid(secret) || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Configure credencial e porta válidas para a entrada de solicitações de reserva.');
  process.exitCode = 1;
} else if (readSecret && secret!.toLowerCase() === readSecret.toLowerCase()) {
  console.error('RESERVATION_INTAKE_SECRET precisa ser diferente de ASSISTANT_SERVICE_SECRET.');
  process.exitCode = 1;
} else {
  const purge = () => purgeExpiredReservationIntake()
    .then(count => { if (count > 0) console.log(`Retenção: ${count} registro(s) de solicitação expirado(s) removido(s).`); })
    .catch(() => console.error('Falha na limpeza de retenção das solicitações de reserva.'));
  void purge();
  setInterval(purge, 24 * 60 * 60 * 1000).unref();
  createReservationIntakeApp(secret, { readSecret })
    .listen(port, '127.0.0.1', () => console.log('Entrada de solicitações de reserva iniciada em loopback.'));
}
