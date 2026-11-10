import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { getWeather } from './weather.js';
import { getTransit } from './transit.js';
import { renderHtml } from './template.js';
import { resolveDevice } from './presets.js';
import { toKindlePng } from './png.js';
import { loadConfig, setOverrides } from './config.js';

const ROOT = path.resolve(import.meta.dirname, '..');
export const OUT = path.join(ROOT, 'out');

export { loadConfig, setOverrides };

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
  if (get('--demo')) ov.demo = get('--demo');
  if (get('--from') || get('--to') || get('--trip')) ov.transit = { ...(get('--from') ? { from: get('--from') } : {}), ...(get('--to') ? { to: get('--to') } : {}), ...(get('--trip') ? { trip: get('--trip') } : {}) };
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
