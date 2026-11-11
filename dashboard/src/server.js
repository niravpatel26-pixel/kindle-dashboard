// Serves the dashboard over plain HTTP on the LAN so the Kindle's old curl can
// fetch it without TLS. GET /dashboard.png?battery=NN renders a fresh image.
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { renderPng, buildHtml, loadConfig, OUT } from './render.js';
import { scanLibrary, resolveBook, opdsFeed } from './library.js';
import { listStations, ensureFeed, getTransit } from './transit.js';
import { writeLocalConfig } from './config.js';
import { settingsPage } from './settings.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const config = loadConfig();
const PORT = Number(process.env.PORT || config.server?.port || 8080);
const LIB_ROOTS = (config.library?.paths ?? ['../books']).map((p) => path.resolve(ROOT, p));
const MIME = { '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.html': 'text/html' };

let stationCache = null, stationFeed = null;
async function stations() {
  const meta = await ensureFeed();
  if (!stationCache || stationFeed !== meta.downloadedAt) { stationCache = listStations(); stationFeed = meta.downloadedAt; }
  return stationCache;
}
async function formBody(req) {
  let b = '';
  for await (const chunk of req) { b += chunk; if (b.length > 65536) throw new Error('form body too large'); }
  return new URLSearchParams(b);
}

// Renders run one at a time. The chain itself always settles, so a failed
// render is reported to its own request and can never become an unhandled
// rejection that takes the server down.
let queue = Promise.resolve();
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// Stream a regular file to the response. A directory, a vanished file or a
// read error becomes a 404/500 instead of an uncaught stream error.
function sendFile(res, file, type, extraHeaders = {}) {
  let st;
  try { st = fs.statSync(file); } catch { res.writeHead(404); return res.end('not found'); }
  if (!st.isFile()) { res.writeHead(404); return res.end('not found'); }
  const stream = fs.createReadStream(file);
  stream.on('error', (e) => { if (!res.headersSent) res.writeHead(500); res.end(`read error: ${e.message}`); });
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, ...extraHeaders });
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  let url, battery;
  try {
    url = new URL(req.url, 'http://localhost');   // can throw on a malformed request target
    battery = url.searchParams.get('battery');
    if (url.pathname === '/dashboard.png') {
      const { png, error, refreshSeconds: next } = await enqueue(() => renderPng({ battery }));
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'no-store', 'X-Refresh-Seconds': String(next) });
      res.end(png);
      log(req, 200, t0, `${error ? `weather error: ${error} ` : ''}battery=${battery ?? '-'} next=${next}s`);
      // One line per fetch, kept forever: a record of when the Kindle woke and its battery.
      try { fs.appendFileSync(path.join(OUT, 'fetch.log'), `${new Date().toISOString()} battery=${battery ?? '-'} ${url.searchParams.has('t') ? 'loop' : 'test'} ${req.socket.remoteAddress ?? ''}\n`); } catch { /* not fatal */ }
    } else if (url.pathname === '/' || url.pathname === '/dashboard.html') {
      const { html } = await enqueue(() => buildHtml({ battery }));   // shares out/dashboard.html with renders
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html.replaceAll('../node_modules/', '/node_modules/'));
      log(req, 200, t0);
    } else if (url.pathname.startsWith('/node_modules/@fontsource/') && !url.pathname.includes('..')) {
      const file = path.join(ROOT, url.pathname);
      sendFile(res, file, MIME[path.extname(file)] ?? 'application/octet-stream', { 'Cache-Control': 'max-age=86400' });
    } else if (url.pathname === '/last.png') {
      sendFile(res, path.join(OUT, 'dashboard.png'), 'image/png');
    } else if (url.pathname === '/settings' && req.method === 'GET') {
      const cfg = loadConfig();
      const st = await stations();
      let next = null;
      if (cfg.transit?.enabled) { try { next = await getTransit(cfg); } catch (e) { next = { error: e.message, departures: [] }; } }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(settingsPage({ cfg, stations: st, next, saved: url.searchParams.get('saved'), error: url.searchParams.get('error') }));
      log(req, 200, t0);
    } else if (url.pathname === '/toggle' && req.method === 'POST') {
      const trip = (await formBody(req)).get('trip');
      if (!['there', 'back', 'auto'].includes(trip)) { res.writeHead(400); return res.end('bad trip'); }
      try { writeLocalConfig({ transit: { trip } }); }
      catch (e) { res.writeHead(303, { Location: '/settings?error=' + encodeURIComponent(e.message) }); return res.end(); }
      res.writeHead(303, { Location: '/settings?saved=1' }); res.end();
      log(req, 303, t0, `trip=${trip}`);
    } else if (url.pathname === '/settings' && req.method === 'POST') {
      const b = await formBody(req);
      const codes = new Set((await stations()).map((s) => s.id));
      const from = (b.get('from') ?? '').toUpperCase(), to = (b.get('to') ?? '').toUpperCase();
      if (!codes.has(from)) { res.writeHead(303, { Location: '/settings?error=' + encodeURIComponent('Unknown station: ' + from) }); return res.end(); }
      const flipAt = /^([01]\d|2[0-3]):[0-5]\d$/.test(b.get('flipAt') ?? '') ? b.get('flipAt') : '12:00';
      const count = Math.min(6, Math.max(1, parseInt(b.get('count') ?? '4', 10) || 4));
      try { writeLocalConfig({ transit: { from, to: codes.has(to) && to !== from ? to : '', flipAt, count } }); }
      catch (e) { res.writeHead(303, { Location: '/settings?error=' + encodeURIComponent(e.message) }); return res.end(); }
      res.writeHead(303, { Location: '/settings?saved=1' }); res.end();
      log(req, 303, t0, `route ${from}→${to || '-'}`);
    } else if (url.pathname === '/location' && req.method === 'POST') {
      // City name → coordinates + timezone via Open-Meteo's free geocoder.
      const q = ((await formBody(req)).get('place') ?? '').trim().slice(0, 80);
      if (!q) { res.writeHead(303, { Location: '/settings?error=' + encodeURIComponent('Type a place name') }); return res.end(); }
      const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`, { signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => null);
      const hit = g?.results?.[0];
      if (!hit) { res.writeHead(303, { Location: '/settings?error=' + encodeURIComponent(`Could not find "${q}"`) }); return res.end(); }
      const name = hit.admin1 && hit.admin1 !== hit.name ? `${hit.name}, ${hit.admin1}` : hit.name;
      try { writeLocalConfig({ location: { name, latitude: hit.latitude, longitude: hit.longitude, timezone: hit.timezone } }); }
      catch (e) { res.writeHead(303, { Location: '/settings?error=' + encodeURIComponent(e.message) }); return res.end(); }
      try { fs.rmSync(path.join(OUT, 'weather-cache.json'), { force: true }); } catch { /* fine */ }
      res.writeHead(303, { Location: '/settings?saved=1' }); res.end();
      log(req, 303, t0, `location ${name} (${hit.latitude}, ${hit.longitude}) ${hit.timezone}`);
    } else if (url.pathname === '/opds' || url.pathname === '/opds/') {
      const books = scanLibrary(LIB_ROOTS);
      const baseUrl = `http://${req.headers.host || `localhost:${PORT}`}`;
      res.writeHead(200, { 'Content-Type': 'application/atom+xml;profile=opds-catalog;kind=acquisition; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(opdsFeed(books, { title: config.library?.title ?? 'Mac library', baseUrl }));
      log(req, 200, t0, `${books.length} books`);
    } else if (url.pathname.startsWith('/books/')) {
      const book = resolveBook(LIB_ROOTS, decodeURIComponent(url.pathname.slice(7)));
      if (!book) { res.writeHead(404); return res.end('no such book'); }
      sendFile(res, book.file, book.type, { 'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(book.file))}"` });
      log(req, 200, t0, path.basename(book.file));
    } else if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok');
    } else {
      res.writeHead(404); res.end('not found');
    }
  } catch (e) {
    const status = /too large/.test(e.message) ? 413 : /ERR_INVALID_URL/.test(e.code ?? '') ? 400 : 500;
    log(req, status, t0, e.message);
    if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'text/plain' });
    res.end(status === 413 ? 'request too large' : status === 400 ? 'bad request' : `error: ${e.message}`);
  }
});

// This process runs unattended for weeks: log anything that slipped through
// rather than exiting and leaving the Kindle with a stale image.
process.on('unhandledRejection', (e) => console.error(`${new Date().toISOString()} unhandled rejection: ${e?.stack ?? e}`));
process.on('uncaughtException', (e) => console.error(`${new Date().toISOString()} uncaught exception: ${e?.stack ?? e}`));

function log(req, status, t0, extra = '') {
  console.log(`${new Date().toISOString()} ${status} ${req.method} ${req.url} ${Date.now() - t0}ms ${extra}`);
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Kindle dashboard server on port ${PORT}`);
  for (const ip of ips) console.log(`  Kindle URL: http://${ip}:${PORT}/dashboard.png`);
  console.log(`  Preview:    http://localhost:${PORT}/`);
  for (const ip of ips) console.log(`  Settings (open on your phone): http://${ip}:${PORT}/settings`);
  for (const ip of ips) console.log(`  KOReader OPDS catalogue: http://${ip}:${PORT}/opds`);
  console.log(`  Library folders: ${LIB_ROOTS.join(', ')}`);
});
