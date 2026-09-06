/** Generate a browser-local correlation id without requiring a secure context. */
export function createTurnId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const values = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues)
    globalThis.crypto.getRandomValues(values);
  else {
    values[0] = Math.floor(Math.random() * 0xffffffff);
    values[1] = Math.floor(Math.random() * 0xffffffff);
  }
  return `turn-${Date.now().toString(36)}-${values[0].toString(36)}${values[1].toString(36)}`;
}
