// src/config/env.ts
// Typed environment access. Never expose raw process.env elsewhere.

export interface AppConfig {
  geminiApiKey: string | undefined;
  llmEnabled: boolean;
  llmTimeoutMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  confidenceThreshold: number;
}

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (_config) return _config;

  _config = {
    geminiApiKey: process.env.GEMINI_API_KEY || undefined,
    llmEnabled: process.env.LLM_ENABLED === 'true',
    llmTimeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '5500', 10) || 5500,
    logLevel: validateLogLevel(process.env.LOG_LEVEL),
    confidenceThreshold: 0.85,
  };

  return _config;
}

function validateLogLevel(
  level: string | undefined
): 'debug' | 'info' | 'warn' | 'error' {
  const valid = ['debug', 'info', 'warn', 'error'] as const;
  if (level && (valid as readonly string[]).includes(level)) {
    return level as (typeof valid)[number];
  }
  return 'info';
}

// Reset config (useful for testing)
export function resetConfig(): void {
  _config = null;
}
