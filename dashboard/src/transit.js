// GO Transit departures from the public GTFS schedule (no key), with optional
// real-time predictions from the Metrolinx Open Data API when a key is set.
// Data: Open Government Licence – Ontario – Metrolinx.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(import.meta.dirname, '../out');
const GTFS_URL = 'https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip';
const ZIP = path.join(OUT, 'go-gtfs.zip');
const FEED = path.join(OUT, 'gtfs');
const META = path.join(OUT, 'go-gtfs.meta.json');
const execFileP = promisify(execFile);

// ---------- feed download (checked daily, re-downloaded when the ETag changes) ----------
async function ensureFeed() {
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(META, 'utf8')); } catch { /* none yet */ }
  const have = fs.existsSync(path.join(FEED, 'stop_times.txt'));
  if (have && meta.checkedAt && Date.now() - meta.checkedAt < 24 * 3600 * 1000) return meta;
  fs.mkdirSync(OUT, { recursive: true });
  let etag = '';
  try {
    const head = await fetch(GTFS_URL, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
    etag = head.headers.get('etag') || head.headers.get('last-modified') || '';
  } catch (e) {
    if (have) return meta;           // offline: keep using what we have
    throw e;
  }
  if (have && etag && etag === meta.etag) {
    meta.checkedAt = Date.now();
    fs.writeFileSync(META, JSON.stringify(meta));
    return meta;
  }
  const res = await fetch(GTFS_URL, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`GTFS download ${res.status}`);
  fs.writeFileSync(ZIP, Buffer.from(await res.arrayBuffer()));
  fs.rmSync(FEED, { recursive: true, force: true });
  fs.mkdirSync(FEED, { recursive: true });
  try {
    await execFileP('unzip', ['-o', '-q', ZIP, '-d', FEED]);
  } catch (e) {
    throw new Error(`could not unzip GTFS (is "unzip" installed?): ${e.message}`);
  }
  for (const f of fs.readdirSync(OUT)) if (/^transit-.*\.json$/.test(f)) fs.rmSync(path.join(OUT, f));
  meta = { etag, checkedAt: Date.now(), downloadedAt: Date.now() };
  fs.writeFileSync(META, JSON.stringify(meta));
  return meta;
}

// ---------- CSV ----------
function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const v = parseCsvLine(l); const o = {};
    header.forEach((h, i) => { o[h] = v[i] ?? ''; });
    return o;
  });
}

export function listStations() {
  return readCsv(path.join(FEED, 'stops.txt'))
    .filter((s) => !/\d/.test(s.stop_id))            // rail stations have letter codes
    .map((s) => ({ id: s.stop_id, name: s.stop_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- per-station index: every departure in the feed window ----------
async function buildIndex(stopId) {
  const routes = Object.fromEntries(readCsv(path.join(FEED, 'routes.txt')).map((r) => [r.route_id, r]));
  const trips = new Map(readCsv(path.join(FEED, 'trips.txt')).map((t) => [t.trip_id, t]));
  const stop = readCsv(path.join(FEED, 'stops.txt')).find((s) => s.stop_id === stopId);
  if (!stop) throw new Error(`stop "${stopId}" is not in the GO feed (run: node src/transit.js --stations)`);
  const maxSeq = new Map(); const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(FEED, 'stop_times.txt')) });
  let first = true;
  for await (const raw of rl) {
    if (first) { first = false; continue; }
    const v = raw.includes('"') ? parseCsvLine(raw) : raw.split(',');
    const tripId = v[0], seq = +v[4];
    const m = maxSeq.get(tripId);
    if (m === undefined || seq > m) maxSeq.set(tripId, seq);
    if (v[3] === stopId) rows.push({ tripId, dep: v[2], seq, pickup: v[5] });
  }
  const departures = [];
  for (const r of rows) {
    const t = trips.get(r.tripId);
    if (!t || r.pickup === '1') continue;
    if (r.seq === maxSeq.get(r.tripId)) continue;      // end of the line: an arrival, not a departure
    const route = routes[t.route_id] ?? {};
    departures.push({
      service: t.service_id, time: r.dep, trip: t.trip_id,
      line: route.route_short_name ?? '', lineName: route.route_long_name ?? '', type: route.route_type ?? '',
      dir: Number(t.direction_id), headsign: t.trip_headsign ?? '',
    });
  }
  departures.sort((a, b) => a.service.localeCompare(b.service) || a.time.localeCompare(b.time));
  const idx = { stopId, stopName: stop.stop_name, builtAt: Date.now(), departures };
  fs.writeFileSync(path.join(OUT, `transit-${stopId}.json`), JSON.stringify(idx));
  return idx;
}

const memo = new Map();
async function getIndex(stopId) {
  await ensureFeed();
  const file = path.join(OUT, `transit-${stopId}.json`);
  if (memo.has(stopId) && fs.existsSync(file)) return memo.get(stopId);
  let idx;
  try { idx = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { idx = await buildIndex(stopId); }
  memo.set(stopId, idx);
  return idx;
}

// ---------- time helpers ----------
function localClock(now, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now).map((x) => [x.type, x.value]));
  const h = p.hour === '24' ? 0 : Number(p.hour);
  return { ymd: `${p.year}${p.month}${p.day}`, secs: h * 3600 + Number(p.minute) * 60 + Number(p.second) };
}
function ymdOffset(ymd, days) {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + days));
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
const hms = (s) => { const [h, m, sec] = s.split(':').map(Number); return h * 3600 + m * 60 + (sec || 0); };
const fmtHm = (secs) => `${String(Math.floor((secs % 86400) / 3600)).padStart(2, '0')}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}`;

// "LW - Aldershot GO" → "Aldershot"
export function destination(headsign) {
  return headsign.replace(/^[A-Z]{2,3}\s*-\s*/, '').replace(/\s+GO( Centre)?$/, (m, c) => (c ? ' Centre' : '')).trim();
}

export function nextDepartures(idx, config, now = new Date()) {
  const t = config.transit ?? {};
  const { ymd, secs } = localClock(now, config.location.timezone);
  const yday = ymdOffset(ymd, -1);
  const wantDir = t.direction === 'auto' || t.direction == null ? (idx.stopId === 'UN' ? 0 : 1) : t.direction;
  const lines = (t.lines ?? []).map((s) => String(s).toUpperCase());
  const out = [];
  for (const d of idx.departures) {
    if (t.railOnly !== false && d.type !== '2') continue;
    if (lines.length && !lines.includes(d.line)) continue;
    if (wantDir !== 'all' && d.dir !== Number(wantDir)) continue;
    let dep = hms(d.time);
    if (d.service === yday && dep >= 86400) dep -= 86400;   // after-midnight trip of yesterday's service
    else if (d.service !== ymd) continue;
    if (dep < secs - 8 * 60) continue;
    out.push({ ...d, dest: destination(d.headsign), hhmm: fmtHm(dep), inMin: Math.round((dep - secs) / 60) });
  }
  out.sort((a, b) => a.inMin - b.inMin);
  const upcoming = out.filter((d) => d.inMin >= -1);
  const gone = out.filter((d) => d.inMin < -1);
  return { departures: upcoming.slice(0, t.count ?? 4), recent: gone.length ? gone[gone.length - 1] : null };
}

// ---------- optional real-time overlay (Metrolinx Open Data API) ----------
// Endpoint per the API help: GET api/V1/Stop/NextService/{StopCode}. The key
// query parameter name is the conventional "key"; adjust if your key's docs differ.
async function realtime(stopId, key) {
  const url = `https://api.openmetrolinx.com/OpenDataAPI/api/V1/Stop/NextService/${encodeURIComponent(stopId)}?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Metrolinx ${res.status}`);
  const j = await res.json();
  const code = j?.Metadata?.ErrorCode;
  if (code && String(code) !== '200') throw new Error(`Metrolinx: ${j.Metadata.ErrorMessage ?? code}`);
  return j?.NextService?.Lines ?? [];
}
function overlay(departures, lines) {
  for (const d of departures) {
    const hit = lines.find((l) => (l.LineCode ?? '').toUpperCase() === d.line && String(l.ScheduledDepartureTime ?? '').includes(d.hhmm));
    if (!hit) continue;
    d.platform = hit.ActualPlatform || hit.ScheduledPlatform || '';
    d.status = hit.DepartureStatus || hit.Status || '';
    const comp = String(hit.ComputedDepartureTime ?? '').match(/(\d{2}):(\d{2})/);
    if (comp) {
      const c = +comp[1] * 3600 + +comp[2] * 60, s = hms(d.hhmm + ':00');
      d.delayMin = Math.round((c - s) / 60);
      if (d.delayMin > 0) d.hhmmLive = fmtHm(c);
    }
  }
}

export async function getTransit(config, now = new Date()) {
  const t = config.transit ?? {};
  const idx = await getIndex(t.stop ?? 'UN');
  const { departures, recent } = nextDepartures(idx, config, now);
  let live = false, liveError = null;
  if (t.metrolinxKey) {
    try { overlay(departures, await realtime(idx.stopId, t.metrolinxKey)); live = true; }
    catch (e) { liveError = e.message; }
  }
  const dir = t.direction === 'auto' || t.direction == null ? (idx.stopId === 'UN' ? 0 : 1) : t.direction;
  return { stopId: idx.stopId, stopName: idx.stopName.replace(/\s+GO$/, ''), departures, recent, live, liveError, direction: dir };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const { loadConfig } = await import('./render.js');
  const config = loadConfig();
  if (args.includes('--stations')) {
    await ensureFeed();
    for (const s of listStations()) console.log(`${s.id.padEnd(5)} ${s.name}`);
  } else {
    const i = args.indexOf('--stop'); if (i >= 0) config.transit = { ...config.transit, stop: args[i + 1] };
    const r = await getTransit(config);
    console.log(`${r.stopName} (${r.stopId}) ${r.direction === 0 ? 'outbound' : r.direction === 1 ? 'to Union' : 'all'}${r.live ? ' [live]' : ''}${r.liveError ? ' live error: ' + r.liveError : ''}`);
    for (const d of r.departures) console.log(`${d.hhmm}  ${d.line.padEnd(3)} ${d.dest.padEnd(26)} in ${d.inMin} min${d.platform ? '  pl ' + d.platform : ''}${d.status ? '  ' + d.status : ''}`);
  }
}
