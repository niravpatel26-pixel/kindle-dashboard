import fs from 'node:fs';
import path from 'node:path';
import { icon, batteryIcon } from './icons.js';
import { describe, compassPoint } from './weather.js';

const CSS = fs.readFileSync(path.join(import.meta.dirname, 'template', 'style.css'), 'utf8');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const deg = (n) => `${Math.round(n)}°`;

export function renderHtml({ config, device, weather, transit, battery, now, error }) {
  const tz = config.location.timezone;
  const locale = config.locale || 'en';
  const hour12 = !!config.clock?.hour12;
  const fmt = (opts) => new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts });

  const timeStr = fmt({ hour: '2-digit', minute: '2-digit', hour12 }).format(now);
  const dateStr = fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const showClock = config.clock?.show !== false;

  const showTransit = !!(config.transit?.enabled && transit);
  // With trains on the page, 7 forecast rows only fit in portrait without the clock.
  const maxDays = showTransit && showClock && !device.landscape ? 4
    : showTransit && (showClock || device.landscape) ? 5
    : (config.daily?.days ?? 7);
  let body;
  if (!weather) {
    body = `<div class="error">Weather unavailable: ${esc(error ?? 'no data')}</div>`;
  } else {
    body = [
      renderNow(weather, config, fmt),
      renderHourly(weather, config, fmt, now),
      showTransit ? renderTransit(transit, config, showClock && !device.landscape ? 3 : undefined) : '',
      renderDaily(weather, config, fmt, now, maxDays),
    ].join('\n');
  }
  // One grid row per section in portrait; the forecast takes what is left.
  const rowCount = 2 + (showClock ? 1 : 0) + (weather ? 1 : 0) + (showTransit ? 1 : 0);
  const rows = `${'auto '.repeat(rowCount)}minmax(0, 1fr)`;

  // 12-hour clocks: split "5:26 PM" into number + small suffix
  let clock = esc(timeStr);
  const m = timeStr.match(/^(\d{1,2}:\d{2})\s*(.+)$/);
  if (hour12 && m) clock = `${m[1]}<small>${esc(m[2])}</small>`;

  const batt = battery != null && battery !== '' && !Number.isNaN(+battery)
    ? `<span class="battery">${batteryIcon(+battery)} ${Math.round(+battery)}%</span>` : '';

  return `<!doctype html>
<html lang="${esc(locale)}">
<head>
<meta charset="utf-8">
<title>Kindle dashboard</title>
<link rel="stylesheet" href="../node_modules/@fontsource/inter/400.css">
<link rel="stylesheet" href="../node_modules/@fontsource/inter/500.css">
<link rel="stylesheet" href="../node_modules/@fontsource/inter/600.css">
<link rel="stylesheet" href="../node_modules/@fontsource/inter/700.css">
<link rel="stylesheet" href="../node_modules/@fontsource/fraunces/500.css">
<style>${CSS}</style>
</head>
<body>
<main class="page ${showClock ? '' : 'no-clock'} ${showTransit ? 'has-transit' : ''}" style="--rows: ${rows}">
  <header class="top">
    <div class="date">${esc(dateStr)}</div>
    <div class="meta"><span class="place">${esc(config.location.name ?? '')}</span>${showClock ? '' : `<span class="updated">Updated ${esc(timeStr)}</span>`}${batt}</div>
  </header>
  <section class="clock num">${clock}</section>
  ${body}
</main>
</body>
</html>`;
}

function renderNow(w, config, fmt) {
  const c = w.current, d = w.daily;
  const { icon: ic, label } = describe(c.weather_code, c.is_day === 1);
  const windUnit = config.units.wind === 'mph' ? 'mph' : 'km/h';
  const hhmm = (iso) => fmt({ hour: '2-digit', minute: '2-digit', hour12: !!config.clock?.hour12 }).format(new Date(iso));
  const popToday = d.precipitation_probability_max?.[0] ?? 0;
  const mmToday = d.precipitation_sum?.[0] ?? 0;
  return `
  <section class="now">
    <div class="big">${icon(ic)}<div class="temp num">${Math.round(c.temperature_2m)}<sup>°</sup></div></div>
    <div class="desc">
      <div class="cond">${esc(label)}</div>
      <div class="sub">Feels like ${deg(c.apparent_temperature)} · Humidity ${Math.round(c.relative_humidity_2m)}%</div>
    </div>
    <ul class="stats">
      <li><span class="k">High / Low</span><span class="v"><span class="num">${deg(d.temperature_2m_max[0])}</span> <span style="color:var(--ink-3)">/</span> <span class="num">${deg(d.temperature_2m_min[0])}</span></span></li>
      <li><span class="k">Rain</span><span class="v">${icon('umbrella')}${popToday}% · ${fmtMm(mmToday)}</span></li>
      <li><span class="k">Wind</span><span class="v">${icon('wind')}${Math.round(c.wind_speed_10m)} ${windUnit} ${compassPoint(c.wind_direction_10m)}</span></li>
      <li><span class="k">Sun</span><span class="v">${icon('sunrise')}${hhmm(d.sunrise[0])} ${icon('sunset')}${hhmm(d.sunset[0])}</span></li>
    </ul>
  </section>`;
}

function renderHourly(w, config, fmt, now) {
  const h = w.hourly;
  const slots = config.hourly?.slots ?? 8;
  const step = config.hourly?.stepHours ?? 3;
  // hourly.time is local to the location timezone, e.g. "2026-11-10T17:00"
  const nowLocal = localIsoHour(now, config.location.timezone);
  let start = h.time.findIndex((t) => t >= nowLocal);
  if (start < 0) start = 0;
  const hour12 = !!config.clock?.hour12;
  const out = [];
  const c = w.current;
  for (let i = 0; i < slots; i++) {
    const idx = start + i * step;
    if (idx >= h.time.length) break;
    const live = i === 0 && c;
    const { icon: ic } = live ? describe(c.weather_code, c.is_day === 1) : describe(h.weather_code[idx], h.is_day[idx] === 1);
    const temp = live ? c.temperature_2m : h.temperature_2m[idx];
    const pop = h.precipitation_probability?.[idx] ?? 0;
    const t = h.time[idx].slice(11, 16);
    const label = hour12 ? to12(t) : t;
    out.push(`<div class="slot"><div class="t">${i === 0 ? 'Now' : esc(label)}</div>${icon(ic)}<div class="temp num">${deg(temp)}</div><div class="pop ${pop >= 50 ? 'hi' : ''}">${pop}%</div></div>`);
  }
  return `<section class="hourly">${out.join('')}</section>`;
}

// A side-view train on a track. Its distance from the platform is the minutes
// until the next departure (45 min = far left), so every refresh it creeps
// closer; a train that left in the last few minutes is drawn pulling away.
function trainStrip(tr) {
  const W = 1000, H = 64, rail = 50, plat = 780, far = 45;
  const next = tr.departures?.[0];
  const train = (nose, puffs) => {
    const wheel = (cx) => `<circle cx="${cx}" cy="${rail - 4}" r="6" fill="#000" stroke="#fff" stroke-width="3"/>`;
    const smoke = puffs ? [0, 1, 2].map((i) => {
      const k = (puffs + i) % 3;
      return `<circle cx="${(nose - 108 - i * 16 - k * 3).toFixed(1)}" cy="${(14 - i * 4 - k * 2).toFixed(1)}" r="${3.5 + i}" fill="none" stroke="#000" stroke-width="2.5"/>`;
    }).join('') : '';
    return `<g transform="translate(${nose.toFixed(1)} 0)">
      <rect x="-118" y="16" width="86" height="30" rx="6" fill="#000"/>
      <path d="M-32 46V22a6 6 0 0 1 6-6h16a10 10 0 0 1 10 10v20z" fill="#000"/>
      <rect x="-110" y="22" width="16" height="11" rx="2" fill="#fff"/>
      <rect x="-90" y="22" width="16" height="11" rx="2" fill="#fff"/>
      <rect x="-70" y="22" width="16" height="11" rx="2" fill="#fff"/>
      <rect x="-48" y="22" width="12" height="11" rx="2" fill="#fff"/>
      <circle cx="-4" cy="34" r="3" fill="#fff"/>
      ${wheel(-104)}${wheel(-76)}${wheel(-48)}${wheel(-16)}
      <path d="M-128 34h10" stroke="#000" stroke-width="4"/>
      <rect x="-218" y="18" width="90" height="28" rx="5" fill="#fff" stroke="#000" stroke-width="3.5"/>
      <rect x="-208" y="24" width="14" height="10" rx="2" fill="#000"/>
      <rect x="-188" y="24" width="14" height="10" rx="2" fill="#000"/>
      <rect x="-168" y="24" width="14" height="10" rx="2" fill="#000"/>
      <rect x="-148" y="24" width="14" height="10" rx="2" fill="#000"/>
      ${wheel(-204)}${wheel(-176)}${wheel(-142)}
    </g>${smoke}`;
  };
  const ties = Array.from({ length: Math.floor(W / 36) }, (_, i) => `M${i * 36 + 10} ${rail + 2}v7`).join('');
  let moving = '';
  if (next) {
    const p = 1 - Math.min(Math.max(next.inMin, 0), far) / far;       // 0 far away → 1 at platform
    const nose = 230 + p * (plat - 230);
    moving += train(nose, next.inMin > 0 ? 1 + (next.inMin % 3) : 0);
  }
  if (tr.recent) {
    const q = Math.min(-tr.recent.inMin - 1, 6) / 6;                    // 0 just left → 1 off the edge
    moving += train(plat + 30 + q * (W + 240 - plat), 2);
  }
  const code = esc((tr.stopId ?? '').slice(0, 4));
  return `<svg class="strip" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="${ties}" stroke="#bbb" stroke-width="3"/>
    <line x1="0" y1="${rail + 2}" x2="${W}" y2="${rail + 2}" stroke="#000" stroke-width="3"/>
    ${moving}
    <rect x="${plat + 8}" y="${rail - 8}" width="${W - plat - 8}" height="8" fill="#000"/>
    <path d="M${plat + 60} ${rail - 8}V14" stroke="#fff" stroke-width="9"/>
    <path d="M${plat + 60} ${rail - 8}V14" stroke="#000" stroke-width="4"/>
    <rect x="${plat + 34}" y="0" width="52" height="22" rx="4" fill="#000" stroke="#fff" stroke-width="3"/>
    <text x="${plat + 60}" y="16" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="13" fill="#fff">${code}</text>
  </svg>`;
}

function renderTransit(tr, config, maxTrains) {
  const dirLabel = tr.direction === 0 ? 'Departures' : tr.direction === 1 ? 'To Union' : 'All trains';
  const live = tr.live ? ' · live' : '';
  let rows;
  if (tr.error) rows = `<div class="train none">${esc(tr.error)}</div>`;
  else if (!tr.departures.length) rows = `<div class="train none">No more trains today</div>`;
  else rows = tr.departures.slice(0, maxTrains ?? tr.departures.length).map((d) => {
    const late = d.delayMin > 0;
    const status = late ? `+${d.delayMin} min` : d.status ? d.status : d.inMin <= 1 ? 'now' : `in ${d.inMin} min`;
    const cls = late ? 'late' : d.inMin <= 10 ? 'soon' : '';
    return `<div class="train">
      <span class="t num">${esc(d.hhmmLive ?? d.hhmm)}</span>
      <span class="badge">${esc(d.line)}</span>
      <span class="dest">${esc(d.dest)}${d.platform ? `<small>Platform ${esc(d.platform)}</small>` : ''}</span>
      <span class="st ${cls}">${esc(status)}</span>
    </div>`;
  }).join('');
  return `<section class="transit">
    <div class="head"><span class="title">${icon('train')} GO · ${esc(tr.stopName ?? '')}</span><span class="sub">${dirLabel}${live}</span></div>
    ${tr.error ? '' : trainStrip(tr)}
    ${rows}
  </section>`;
}

function renderDaily(w, config, fmt, now, maxDays) {
  const d = w.daily;
  const days = Math.min(maxDays ?? config.daily?.days ?? 7, d.time.length);
  const lows = d.temperature_2m_min.slice(0, days), highs = d.temperature_2m_max.slice(0, days);
  const min = Math.min(...lows), max = Math.max(...highs), span = Math.max(1, max - min);
  const rows = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(d.time[i] + 'T12:00:00');
    const wd = fmt({ weekday: 'short' }).format(date);
    const dn = fmt({ day: 'numeric' }).format(date);
    const { icon: ic } = describe(d.weather_code[i], true);
    const pop = d.precipitation_probability_max?.[i] ?? 0;
    const mm = d.precipitation_sum?.[i] ?? 0;
    const filled = Math.round(pop / 20);
    const dots = Array.from({ length: 5 }, (_, k) => `<i class="${k < filled ? 'on' : ''}"></i>`).join('');
    const left = ((lows[i] - min) / span) * 100, width = ((highs[i] - lows[i]) / span) * 100;
    rows.push(`<div class="day ${i === 0 ? 'today' : ''}">
      <div class="name">${i === 0 ? 'Today' : esc(wd)}<small>${esc(dn)}</small></div>
      ${icon(ic)}
      <div class="precip"><span class="dots">${dots}</span><span>${pop > 0 ? fmtMm(mm) : 'dry'}</span></div>
      <div class="lo num">${deg(lows[i])}</div>
      <div class="bar"><i style="left:${left.toFixed(1)}%;width:${Math.max(width, 4).toFixed(1)}%"></i></div>
      <div class="hi num">${deg(highs[i])}</div>
    </div>`);
  }
  return `<section class="daily">${rows.join('')}</section>`;
}

function fmtMm(mm) {
  if (mm <= 0) return '0 mm';
  if (mm < 1) return '<1 mm';
  return `${Math.round(mm)} mm`;
}
function to12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suf = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''}${suf}`;
}
// "YYYY-MM-DDTHH:00" in the given IANA timezone
function localIsoHour(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:00`;
}
