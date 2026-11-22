import setup from './setup';

export default async function setupRestaurant() {
  process.env.OVERTRIP_E2E_PLATFORM_ONLY = '1';
  process.env.OVERTRIP_E2E_FRONTEND_PORT = '4392';
  return setup();
}
