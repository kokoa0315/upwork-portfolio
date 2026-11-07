export interface StackConfig {
  APP_DB: string;
  PG_PORT: string;
  POSTGREST_PORT: string;
  GATEWAY_PORT: string;
  JWT_SECRET: string;
  appDir: string;
  adminUrl: string;
  dbUrl: string;
  authenticatorUrl: string;
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
}
export function loadConfig(appDir: string): StackConfig;
export function resetDatabase(cfg: StackConfig, opts?: { seed?: boolean; until?: string; wait?: boolean }): Promise<string[]>;
export function writeEnvLocal(cfg: StackConfig, extra?: Record<string, string>): void;
