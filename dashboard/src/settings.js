// The settings page: pick the route once, then toggle going / returning / auto
// from a phone on the same Wi-Fi. Writes config.local.json; the Kindle sees the
// change at its next refresh.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function settingsPage({ cfg, stations, next, saved, error }) {
  const t = cfg.transit ?? {};
  const byId = Object.fromEntries(stations.map((s) => [s.id, s.name]));
  const from = (t.from ?? t.stop ?? 'UN').toUpperCase(), to = (t.to ?? '').toUpperCase();
  const trip = ['there', 'back', 'auto'].includes(t.trip) ? t.trip : 'there';
  const hasRoute = !!to && to !== from;
  const opt = (sel) => stations.map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)} (${s.id})</option>`).join('');
  const btn = (v, label, sub) => `<button name="trip" value="${v}" class="${trip === v ? 'on' : ''}" ${hasRoute ? '' : 'disabled'}>${label}<small>${esc(sub)}</small></button>`;
  const list = next?.departures?.length
    ? next.departures.map((d) => `<li><span><b>${esc(d.hhmmLive ?? d.hhmm)}</b> <span class="badge">${esc(d.line)}</span> ${d.arrHm ? `arrives ${esc(d.arrHm)} · ${d.mins} min` : esc(d.dest)}</span><em>${d.inMin <= 1 ? 'now' : `in ${d.inMin} min`}</em></li>`).join('')
    : `<li class="muted">${esc(next?.error ?? 'No more trains today')}</li>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kindle dashboard settings</title>
<link rel="stylesheet" href="/node_modules/@fontsource/inter/400.css"><link rel="stylesheet" href="/node_modules/@fontsource/inter/600.css">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #f4f4f2; color: #111; }
  main { max-width: 34rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
  h1 { font-size: 1.4rem; margin: 0.5rem 0 0; }
  .sub { color: #666; margin: 0.25rem 0 1.25rem; font-size: 0.9rem; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 12px; padding: 1rem; margin-bottom: 1rem; }
  h2 { font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; color: #666; margin: 0 0 0.75rem; }
  .toggle { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
  .toggle button { min-height: 4.6rem; border: 1.5px solid #111; border-radius: 10px; background: #fff; color: #111; font: inherit; font-weight: 600; padding: 0.6rem 0.4rem; cursor: pointer; }
  .toggle button small { display: block; font-weight: 400; color: #666; font-size: 0.78rem; margin-top: 0.3rem; }
  .toggle button.on { background: #111; color: #fff; } .toggle button.on small { color: #ccc; }
  .toggle button:disabled { opacity: 0.4; cursor: default; }
  label { display: block; margin: 0.6rem 0; font-size: 0.9rem; color: #444; }
  select, input { display: block; width: 100%; margin-top: 0.3rem; padding: 0.6rem 0.7rem; font: inherit; border: 1px solid #ccc; border-radius: 8px; background: #fff; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .save { margin-top: 0.8rem; width: 100%; padding: 0.8rem; font: inherit; font-weight: 600; background: #111; color: #fff; border: 0; border-radius: 10px; cursor: pointer; }
  ul { list-style: none; padding: 0; margin: 0; } li { display: flex; justify-content: space-between; gap: 0.6rem; padding: 0.45rem 0; border-bottom: 1px solid #eee; font-size: 0.95rem; } li:last-child { border: 0; }
  li em { font-style: normal; color: #666; white-space: nowrap; } li.muted { color: #888; }
  .badge { display: inline-block; background: #111; color: #fff; font-size: 0.7rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 4px; margin: 0 0.3rem; }
  .flash { background: #111; color: #fff; padding: 0.6rem 0.9rem; border-radius: 8px; font-size: 0.9rem; margin-bottom: 1rem; }
  .flash.err { background: #b00020; }
  .links { font-size: 0.85rem; color: #666; } .links a { color: #111; }
</style></head>
<body><main>
  <h1>Kindle dashboard</h1>
  <p class="sub">Changes reach the Kindle at its next refresh.</p>
  ${saved ? '<div class="flash">Saved.</div>' : ''}${error ? `<div class="flash err">${esc(error)}</div>` : ''}
  <section class="card">
    <h2>Which way today?</h2>
    <form method="post" action="/toggle" class="toggle">
      ${btn('there', 'Going', hasRoute ? `${byId[from] ?? from} → ${byId[to] ?? to}` : 'set a route below')}
      ${btn('back', 'Returning', hasRoute ? `${byId[to] ?? to} → ${byId[from] ?? from}` : 'set a route below')}
      ${btn('auto', 'Auto', hasRoute ? `returning after ${t.flipAt || '12:00'}` : 'set a route below')}
    </form>
  </section>
  <section class="card">
    <h2>Route</h2>
    <form method="post" action="/settings">
      <div class="row">
        <label>From <select name="from">${opt(from)}</select></label>
        <label>To <select name="to"><option value="" ${to ? '' : 'selected'}>None (departure board)</option>${opt(to)}</select></label>
      </div>
      <div class="row">
        <label>Auto flips at <input type="time" name="flipAt" value="${esc(t.flipAt || '12:00')}"></label>
        <label>Trains shown <input type="number" name="count" min="1" max="6" value="${Number(t.count) || 4}"></label>
      </div>
      <button class="save" type="submit">Save route</button>
    </form>
  </section>
  <section class="card">
    <h2>Next trains ${next ? `· ${esc(next.stopName)}${next.toName ? ` → ${esc(next.toName)}` : ''}` : ''}</h2>
    <ul>${list}</ul>
  </section>
  <p class="links"><a href="/">Preview page</a> · <a href="/last.png">Last image sent to the Kindle</a> · <a href="/opds">Book catalogue</a></p>
</main></body></html>`;
}
