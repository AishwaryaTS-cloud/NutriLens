import { readFileSync } from 'node:fs';

/** Reads the version from server/package.json. */
export function readVersion() {
  const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  return JSON.parse(raw).version;
}
