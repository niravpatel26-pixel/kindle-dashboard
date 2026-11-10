// config.json holds the defaults that ship with the repo. config.local.json
// (git-ignored) is merged over it: put your location, route, API key and book
// folders there so they never end up in a commit.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof a?.[k] === 'object' ? merge(a[k], v) : v;
  }
  return out;
}

const LOCAL = path.join(ROOT, 'config.local.json');
export function readLocalConfig() {
  try { return JSON.parse(fs.readFileSync(LOCAL, 'utf8')); } catch { return {}; }
}
// Deep-merge a patch into config.local.json (the settings page uses this).
export function writeLocalConfig(patch) {
  const next = merge(readLocalConfig(), patch);
  fs.writeFileSync(LOCAL, JSON.stringify(next, null, 2) + '\n');
  return next;
}

let overrides = {};
export function setOverrides(o) { overrides = o; }

export function loadConfig() {
  let c = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  const local = path.join(ROOT, 'config.local.json');
  if (fs.existsSync(local)) c = merge(c, JSON.parse(fs.readFileSync(local, 'utf8')));
  c.device = { ...c.device, ...overrides.device };
  if (overrides.clock) c.clock = { ...c.clock, ...overrides.clock };
  if (overrides.transit) c.transit = { ...c.transit, ...overrides.transit };
  if (overrides.demo) c.demo = overrides.demo;
  return c;
}
