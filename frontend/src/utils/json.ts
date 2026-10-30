export function prettyJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}
