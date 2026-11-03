import 'dotenv/config';
import { createAssistantPrivateApp } from './assistantPrivateApp.js';

const secret = process.env.ASSISTANT_SERVICE_SECRET;
const port = Number(process.env.ASSISTANT_SERVICE_PORT ?? '3010');
if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret) || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Configure credencial e porta válidas para o serviço privado.');
  process.exitCode = 1;
} else {
  createAssistantPrivateApp(secret).listen(port, '127.0.0.1', () => console.log('Serviço privado do assistente iniciado em loopback.'));
}
