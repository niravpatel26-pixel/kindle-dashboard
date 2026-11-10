import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { getWeather } from './weather.js';
import { getTransit } from './transit.js';
import { renderHtml } from './template.js';
import { resolveDevice } from './presets.js';
import { toKindlePng } from './png.js';

const ROOT = path.resolve(import.meta.dirname, '..');
export const OUT = path.join(ROOT, 'out');

// Config from config.json, with optional overrides (used by CLI test renders).
let overrides = {};
export function setOverrides(o) { overrides = o; }
// config.json holds the defaults that ship with the repo. config.local.json
// (git-ignored) is merged over it: put your location, station, API key and
// book folders there so they never end up in a commit.
function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof a?.[k] === 'object' ? merge(a[k], v) : v;
  }
  return out;
}
export function loadConfig() {
  let c = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  const local = path.join(ROOT, 'config.local.json');
  if (fs.existsSync(local)) c = merge(c, JSON.parse(fs.readFileSync(local, 'utf8')));
  c.device = { ...c.device, ...overrides.device };
  if (overrides.clock) c.clock = { ...c.clock, ...overrides.clock };
  return c;
}

let browser;
async function getBrowser() {
  if (!browser) browser = await chromium.launch();
  return browser;
}
export async function closeBrowser() {
  if (browser) { await browser.close(); browser = null; }
}

// Fetch data and write out/dashboard.html. Never throws on weather failure: the
// page shows an error panel instead so the Kindle still gets a fresh image.
export async function buildHtml({ battery } = {}) {
  const config = loadConfig();
  const device = resolveDevice(config.device);
  let weather = null, error = null, transit = null;
  const now = new Date();
  const jobs = [getWeather(config).catch((e) => { error = e.message; return null; })];
  if (config.transit?.enabled) jobs.push(getTransit(config, now).catch((e) => ({ error: e.message, departures: [] })));
  [weather, transit] = await Promise.all(jobs);
  const html = renderHtml({ config, device, weather, transit, battery, now, error });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'dashboard.html'), html);
  return { html, config, device, error };
}

export async function renderPng({ battery, outFile = 'dashboard.png' } = {}) {
  const { device, config, error } = await buildHtml({ battery });
  const page = await (await getBrowser()).newPage({
    viewport: { width: device.pageWidth, height: device.pageHeight },
    deviceScaleFactor: 1,
  });
  try {
    await page.goto('file://' + path.join(OUT, 'dashboard.html'));
    await page.evaluate(() => document.fonts.ready);
    const shot = await page.screenshot({ type: 'png' });
    const png = toKindlePng(shot, { rotate: device.rotate, gamma: config.device.gamma ?? 1 });
    fs.writeFileSync(path.join(OUT, outFile), png);
    return { png, device, error };
  } finally {
    await page.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const battery = get('--battery');
  const dev = {};
  if (get('--preset')) dev.preset = get('--preset');
  if (get('--orientation')) dev.orientation = get('--orientation');
  if (get('--rotate')) dev.rotate = Number(get('--rotate'));
  const ov = { device: dev };
  if (args.includes('--no-clock')) ov.clock = { show: false };
  setOverrides(ov);
  const outName = get('--out');
  if (args.includes('--html')) {
    const { device, error } = await buildHtml({ battery });
    console.log(`wrote out/dashboard.html (${device.pageWidth}x${device.pageHeight})${error ? ' weather error: ' + error : ''}`);
  } else {
    const { device, error } = await renderPng({ battery, outFile: outName ?? 'dashboard.png' });
    console.log(`wrote out/${outName ?? 'dashboard.png'} (${device.fbWidth}x${device.fbHeight}, rotate ${device.rotate})${error ? ' weather error: ' + error : ''}`);
    await closeBrowser();
  }
}
