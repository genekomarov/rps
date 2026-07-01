export const LOG_LIMIT = 200;

export function formatLogTime(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function createLogEntry(level, message) {
  return {
    id: crypto.randomUUID(),
    time: Date.now(),
    level,
    message,
  };
}

export function trimLogEntries(entries, limit = LOG_LIMIT) {
  if (entries.length <= limit) return entries;
  return entries.slice(entries.length - limit);
}
