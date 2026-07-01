import type { LogEntry, LogLevel } from "../types";

export const LOG_LIMIT = 200;

export function formatLogTime(timestamp: number = Date.now()): string {
  return new Date(timestamp).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function createLogEntry(level: LogLevel, message: string): LogEntry {
  return {
    id: crypto.randomUUID(),
    time: Date.now(),
    level,
    message,
  };
}

export function trimLogEntries(entries: LogEntry[], limit: number = LOG_LIMIT): LogEntry[] {
  if (entries.length <= limit) return entries;
  return entries.slice(entries.length - limit);
}
