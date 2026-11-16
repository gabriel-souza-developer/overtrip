import setup from './setup';

export default async function setupPlatform() {
  process.env.OVERTRIP_E2E_PLATFORM_ONLY = '1';
  return setup();
}
