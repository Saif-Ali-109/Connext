const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export function readEnv(name: string, fallback: string, options: { requiredInProduction?: boolean } = {}) {
  const value = process.env[name];
  if (value) return value;

  if (options.requiredInProduction && isProduction()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (!isProduction()) {
    console.warn(`[env] Missing ${name}; using development fallback.`);
  }

  return fallback;
}

export function readNumberEnv(name: string, fallback: number, options: { requiredInProduction?: boolean } = {}) {
  const raw = readEnv(name, String(fallback), options);
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) return parsed;

  if (options.requiredInProduction && isProduction()) {
    throw new Error(`Environment variable ${name} must be a valid number.`);
  }

  console.warn(`[env] Invalid ${name}; using ${fallback}.`);
  return fallback;
}

export { ZERO_ADDRESS };
