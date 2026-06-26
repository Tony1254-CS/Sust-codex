// src/utils/logger.ts
// Redacted structured logger. Never logs secrets, tokens, or stack traces.

import { getConfig } from '../config/env';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

type LogLevel = keyof typeof LOG_LEVELS;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  ticketId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

/** Patterns that must never appear in logs */
const REDACT_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]+/g,
  /AIza[a-zA-Z0-9_-]{30,}/g,
  /[a-fA-F0-9]{32,}/g,
  /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
];

function redact(value: string): string {
  let result = value;
  for (const pattern of REDACT_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

function shouldLog(level: LogLevel): boolean {
  const config = getConfig();
  return LOG_LEVELS[level] >= LOG_LEVELS[config.logLevel];
}

function formatEntry(entry: LogEntry): string {
  return redact(JSON.stringify(entry));
}

function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...extra,
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
      break;
  }
}

export const logger = {
  debug: (message: string, extra?: Record<string, unknown>) =>
    log('debug', message, extra),
  info: (message: string, extra?: Record<string, unknown>) =>
    log('info', message, extra),
  warn: (message: string, extra?: Record<string, unknown>) =>
    log('warn', message, extra),
  error: (message: string, extra?: Record<string, unknown>) =>
    log('error', message, extra),
};
