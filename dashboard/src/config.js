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
  if (!fs.existsSync(LOCAL)) return {};
  return JSON.parse(fs.readFileSync(LOCAL, 'utf8'));   // throws on a corrupt file: callers must not overwrite it
}
// Deep-merge a patch into config.local.json (the settings page uses this).
// Written to a temp file and renamed, so a reader never sees a half-written
// file and two quick writes cannot lose each other's keys.
export function writeLocalConfig(patch) {
  let current;
  try { current = readLocalConfig(); }
  catch (e) { throw new Error(`config.local.json is not valid JSON, fix it by hand first (${e.message})`); }
  const next = merge(current, patch);
  const tmp = `${LOCAL}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  fs.renameSync(tmp, LOCAL);
  return next;
}

// An invalid IANA name (e.g. "auto") would make every Intl call throw and
// take the whole render down, so fall back to the machine's zone.
export function validTimeZone(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; }
  catch { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
}

let overrides = {};
export function setOverrides(o) { overrides = o; }

export function loadConfig() {
  let c = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  try { c = merge(c, readLocalConfig()); }
  catch (e) { console.error(`config.local.json ignored: ${e.message}`); }
  c.location = { ...c.location };
  c.location.timezone = validTimeZone(c.location.timezone);
  if (c.transit) c.transit.count = Math.min(8, Math.max(1, parseInt(c.transit.count, 10) || 4));
  c.device = { ...c.device, ...overrides.device };
  if (overrides.clock) c.clock = { ...c.clock, ...overrides.clock };
  if (overrides.transit) c.transit = { ...c.transit, ...overrides.transit };
  if (overrides.demo) c.demo = overrides.demo;
  return c;
}
