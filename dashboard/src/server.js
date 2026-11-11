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

let stationCache = null;
async function stations() {
  if (!stationCache) { await ensureFeed(); stationCache = listStations(); }
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const battery = url.searchParams.get('battery');
  const t0 = Date.now();
  try {
    if (url.pathname === '/dashboard.png') {
      const { png, error } = await enqueue(() => renderPng({ battery }));
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'no-store' });
      res.end(png);
      log(req, 200, t0, error ? `weather error: ${error}` : `battery=${battery ?? '-'}`);
    } else if (url.pathname === '/' || url.pathname === '/dashboard.html') {
      const { html } = await buildHtml({ battery });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html.replaceAll('../node_modules/', '/node_modules/'));
      log(req, 200, t0);
    } else if (url.pathname.startsWith('/node_modules/@fontsource/') && !url.pathname.includes('..')) {
      const file = path.join(ROOT, url.pathname);
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=86400' });
      fs.createReadStream(file).pipe(res);
    } else if (url.pathname === '/last.png') {
      const file = path.join(OUT, 'dashboard.png');
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end('render first'); }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(file).pipe(res);
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
      writeLocalConfig({ transit: { trip } });
      res.writeHead(303, { Location: '/settings?saved=1' }); res.end();
      log(req, 303, t0, `trip=${trip}`);
    } else if (url.pathname === '/settings' && req.method === 'POST') {
      const b = await formBody(req);
      const codes = new Set((await stations()).map((s) => s.id));
      const from = (b.get('from') ?? '').toUpperCase(), to = (b.get('to') ?? '').toUpperCase();
      if (!codes.has(from)) { res.writeHead(303, { Location: '/settings?error=' + encodeURIComponent('Unknown station: ' + from) }); return res.end(); }
      const flipAt = /^\d{2}:\d{2}$/.test(b.get('flipAt') ?? '') ? b.get('flipAt') : '12:00';
      const count = Math.min(6, Math.max(1, parseInt(b.get('count') ?? '4', 10) || 4));
      writeLocalConfig({ transit: { from, to: codes.has(to) && to !== from ? to : '', flipAt, count } });
      res.writeHead(303, { Location: '/settings?saved=1' }); res.end();
      log(req, 303, t0, `route ${from}→${to || '-'}`);
    } else if (url.pathname === '/opds' || url.pathname === '/opds/') {
      const books = scanLibrary(LIB_ROOTS);
      const baseUrl = `http://${req.headers.host || `localhost:${PORT}`}`;
      res.writeHead(200, { 'Content-Type': 'application/atom+xml;profile=opds-catalog;kind=acquisition; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(opdsFeed(books, { title: config.library?.title ?? 'Mac library', baseUrl }));
      log(req, 200, t0, `${books.length} books`);
    } else if (url.pathname.startsWith('/books/')) {
      const book = resolveBook(LIB_ROOTS, decodeURIComponent(url.pathname.slice(7)));
      if (!book) { res.writeHead(404); return res.end('no such book'); }
      const st = fs.statSync(book.file);
      res.writeHead(200, { 'Content-Type': book.type, 'Content-Length': st.size, 'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(book.file))}"` });
      fs.createReadStream(book.file).pipe(res);
      log(req, 200, t0, path.basename(book.file));
    } else if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok');
    } else {
      res.writeHead(404); res.end('not found');
    }
  } catch (e) {
    const status = /too large/.test(e.message) ? 413 : 500;
    log(req, status, t0, e.message);
    res.writeHead(status, { 'Content-Type': 'text/plain' }); res.end(status === 413 ? 'request too large' : `error: ${e.message}`);
  }
});

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
