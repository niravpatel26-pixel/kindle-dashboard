// The weather frog: a small e-ink mascot whose outfit, props and scene follow
// the weather, the hour, the season, and whether a train is about to leave.
import { describe } from './weather.js';

export function seasonOf(now, tz) {
  const month = Number(new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: 'numeric' }).format(now));
  return month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'fall';
}

export function frogState({ weather, transit, config, now }) {
  const c = weather?.current;
  const season = seasonOf(now, config.location.timezone);
  if (!c) return { base: 'cloudy', pose: 'book', season, isDay: true };
  const isDay = c.is_day === 1;
  const { icon } = describe(c.weather_code, isDay);
  const tempC = config.units?.temperature === 'fahrenheit' ? (c.temperature_2m - 32) * 5 / 9 : c.temperature_2m;
  const windKmh = config.units?.wind === 'mph' ? c.wind_speed_10m * 1.609 : c.wind_speed_10m;
  let base;
  if (icon === 'thunder') base = 'thunder';
  else if (['snow', 'heavy-snow', 'sleet'].includes(icon)) base = 'snow';
  else if (['rain', 'showers', 'heavy-rain', 'drizzle'].includes(icon)) base = 'rain';
  else if (icon === 'fog') base = 'fog';
  else if (!isDay) base = 'night';
  else if (['clear', 'mostly-clear'].includes(icon)) base = 'sunny';
  else base = 'cloudy';
  const hot = tempC >= 27, cold = tempC <= -5, chilly = tempC <= 6, windy = windKmh >= 30;
  const next = transit?.departures?.[0];
  const rush = !!next && next.inMin >= 0 && next.inMin <= 7;
  let pose = 'wave';
  if (rush) pose = 'rush';
  else if (base === 'rain' || base === 'thunder') pose = 'umbrella';
  else if (base === 'snow') pose = 'mittens';
  else if (base === 'fog') pose = 'lantern';
  else if (base === 'night') pose = 'telescope';
  else if (base === 'sunny' && hot) pose = 'icecream';
  else if (base === 'cloudy') pose = 'book';
  return { base, pose, season, hot, cold, chilly, windy, rush, isDay };
}

// Force a state for previews: node src/render.js --demo snow
export function demoState(name, season = 'fall') {
  const d = {
    sunny:   { base: 'sunny',   pose: 'wave',      isDay: true },
    hot:     { base: 'sunny',   pose: 'icecream',  isDay: true, hot: true },
    cloudy:  { base: 'cloudy',  pose: 'book',      isDay: true },
    rain:    { base: 'rain',    pose: 'umbrella',  isDay: true, chilly: true },
    thunder: { base: 'thunder', pose: 'umbrella',  isDay: true, windy: true },
    snow:    { base: 'snow',    pose: 'mittens',   isDay: true, cold: true, chilly: true },
    fog:     { base: 'fog',     pose: 'lantern',   isDay: true, chilly: true },
    night:   { base: 'night',   pose: 'telescope', isDay: false },
    windy:   { base: 'cloudy',  pose: 'wave',      isDay: true, windy: true, chilly: true },
    rush:    { base: 'cloudy',  pose: 'rush',      isDay: true, rush: true },
  }[name] ?? { base: 'cloudy', pose: 'book', isDay: true };
  return { season, ...d };
}

const K = 'stroke="#000" stroke-linecap="round" stroke-linejoin="round"';
const BODY = '#6e6e6e', LIGHT = '#c9c9c9', BELLY = '#e2e2e2';

export function frogSvg(s) {
  const L = [];
  // ---- sky ----
  if (s.base === 'sunny') L.push(sun(20, 20));
  if (s.base === 'night') L.push(moon(102, 18), stars());
  if (['cloudy', 'rain', 'thunder', 'windy'].includes(s.base) || (s.base === 'snow')) L.push(cloud(18, 16, 1), cloud(96, 24, 0.75));
  if (s.base === 'rain') L.push(rain());
  if (s.base === 'thunder') L.push(rain(), bolt(100, 6));
  if (s.base === 'snow') L.push(flakes());
  if (s.base === 'fog') L.push(fog());
  // ---- ground ----
  if (s.base === 'snow' || s.season === 'winter') L.push(snowGround());
  else L.push(`<path d="M0 112H120" ${K} stroke-width="2.5"/>`);
  if (s.season === 'fall' && s.base !== 'snow') L.push(leaves());
  if (s.season === 'spring' && s.base !== 'snow') L.push(flowers());
  if (s.season === 'summer' || (s.season === 'spring' && s.base !== 'snow')) L.push(grass());
  if (s.base === 'rain' || s.base === 'thunder') L.push(puddle());
  if (s.pose === 'telescope') L.push(tripod());
  if (s.pose === 'umbrella') L.push(umbrellaBehind(s));
  // ---- frog ----
  const run = s.pose === 'rush';
  L.push(`<ellipse cx="${run ? 36 : 42}" cy="${run ? 104 : 108}" rx="12" ry="6" fill="${BODY}" ${K} stroke-width="2.5"/>`);
  L.push(`<ellipse cx="${run ? 86 : 78}" cy="${run ? 110 : 108}" rx="12" ry="6" fill="${BODY}" ${K} stroke-width="2.5"/>`);
  L.push(`<ellipse cx="60" cy="90" rx="25" ry="18" fill="${BODY}" ${K} stroke-width="3"/>`);
  L.push(`<ellipse cx="60" cy="94" rx="14" ry="10" fill="${BELLY}"/>`);
  if (s.pose === 'umbrella') L.push(`<ellipse cx="60" cy="54" rx="30" ry="31" fill="${LIGHT}" ${K} stroke-width="2.5"/>`); // rain hood
  L.push(`<circle cx="60" cy="56" r="24" fill="${BODY}" ${K} stroke-width="3"/>`);
  // headwear sits behind the eyes
  const toque = s.base === 'snow' || s.cold;
  if (toque) L.push(`<path d="M38 34q0-24 22-24t22 24z" fill="${LIGHT}" ${K} stroke-width="2.5"/><circle cx="60" cy="10" r="5" fill="#fff" ${K} stroke-width="2.5"/><rect x="36" y="30" width="48" height="8" rx="3" fill="#fff" ${K} stroke-width="2.5"/>`);
  else if (s.base === 'sunny' && !s.hot) L.push(`<path d="M42 32V20q18-10 36 0v12z" fill="${LIGHT}" ${K} stroke-width="2.5"/><ellipse cx="60" cy="32" rx="32" ry="6" fill="${LIGHT}" ${K} stroke-width="2.5"/>`);
  // eyes
  const look = { book: [0, 3], telescope: [3, -3], rush: [2, 0], lantern: [-2, 1] }[s.pose] ?? [0, 0];
  L.push(`<circle cx="48" cy="36" r="9" fill="#fff" ${K} stroke-width="3"/><circle cx="72" cy="36" r="9" fill="#fff" ${K} stroke-width="3"/>`);
  L.push(`<circle cx="${49 + look[0]}" cy="${37 + look[1]}" r="4"/><circle cx="${73 + look[0]}" cy="${37 + look[1]}" r="4"/>`);
  if (s.base === 'sunny') L.push(`<rect x="38" y="31" width="19" height="10" rx="4"/><rect x="63" y="31" width="19" height="10" rx="4"/><path d="M57 35h6" ${K} stroke-width="3"/>`);
  // mouth
  if (run) L.push(`<ellipse cx="60" cy="67" rx="6" ry="4"/>`);
  else if (s.base === 'thunder' || s.base === 'fog') L.push(`<path d="M50 66h20" ${K} stroke-width="3" fill="none"/>`);
  else L.push(`<path d="M46 64q14 10 28 0" ${K} stroke-width="3" fill="none"/>`);
  L.push(`<circle cx="40" cy="58" r="3" fill="${LIGHT}"/><circle cx="80" cy="58" r="3" fill="${LIGHT}"/>`);
  // scarf
  if (s.chilly || s.cold || s.base === 'snow' || (s.windy && s.base !== 'sunny')) {
    L.push(`<rect x="39" y="70" width="42" height="9" rx="4" fill="${LIGHT}" ${K} stroke-width="2.5"/>`);
    L.push(s.windy
      ? `<path d="M80 74q14-6 30-9" ${K} stroke-width="9" fill="none"/><path d="M80 74q14-6 30-9" stroke="${LIGHT}" stroke-width="5" fill="none" stroke-linecap="round"/>`
      : `<path d="M76 78q6 10 2 20" ${K} stroke-width="9" fill="none"/><path d="M76 78q6 10 2 20" stroke="${LIGHT}" stroke-width="5" fill="none" stroke-linecap="round"/>`);
  }
  if (s.cold) L.push(`<circle cx="86" cy="64" r="3" fill="#fff" stroke="#999" stroke-width="1.5"/><circle cx="92" cy="60" r="2" fill="#fff" stroke="#999" stroke-width="1.5"/>`);
  // arms and props
  L.push(armsAndProps(s));
  // weather in front
  if (s.windy) L.push(`<path d="M4 62h14M2 72h18M6 82h12" stroke="#777" stroke-width="2.5" stroke-linecap="round" fill="none"/>`);
  if (s.rush) L.push(`<path d="M20 86h12M14 94h16M20 102h12" stroke="#777" stroke-width="2.5" stroke-linecap="round" fill="none"/><path d="M86 42q4 4 0 8" ${K} stroke-width="2" fill="#fff"/>`);
  return `<svg class="frog" viewBox="0 0 120 120" aria-hidden="true">${L.join('')}</svg>`;
}

function armsAndProps(s) {
  const hand = (x, y, mitt) => `<circle cx="${x}" cy="${y}" r="${mitt ? 6 : 4.5}" fill="${mitt ? LIGHT : BODY}" ${K} stroke-width="2.5"/>`;
  const arm = (x1, y1, x2, y2) => `<path d="M${x1} ${y1}Q${(x1 + x2) / 2} ${Math.max(y1, y2) + 4} ${x2} ${y2}" ${K} stroke-width="7" fill="none"/><path d="M${x1} ${y1}Q${(x1 + x2) / 2} ${Math.max(y1, y2) + 4} ${x2} ${y2}" stroke="${BODY}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  switch (s.pose) {
    case 'book':
      return `${arm(38, 84, 46, 92)}${arm(82, 84, 74, 92)}
        <path d="M36 80L60 85L84 80V98L60 103L36 98Z" fill="#fff" ${K} stroke-width="2.5"/>
        <path d="M60 85V103M42 86l14 3M42 91l14 3M64 89l14-3M64 94l14-3" stroke="#000" stroke-width="1.6" fill="none"/>`;
    case 'umbrella':
      return `${arm(38, 84, 28, 80)}${arm(82, 84, 90, 98)}${hand(90, 98)}${hand(28, 80)}`;
    case 'telescope':
      return `${arm(38, 84, 30, 96)}${hand(30, 96)}${arm(82, 84, 90, 72)}
        <g transform="rotate(-38 92 74)"><rect x="80" y="68" width="40" height="12" rx="3" fill="${LIGHT}" ${K} stroke-width="2.5"/><rect x="112" y="65" width="10" height="18" rx="2" fill="#000"/><rect x="74" y="70" width="8" height="8" rx="2" fill="#000"/></g>${hand(90, 72)}`;
    case 'icecream':
      return `${arm(38, 84, 30, 96)}${hand(30, 96)}${arm(82, 84, 94, 84)}
        <path d="M85 70h18l-9 20z" fill="${LIGHT}" ${K} stroke-width="2.5"/><path d="M88 76l12 2M90 82l8 2" stroke="#000" stroke-width="1.4"/>
        <circle cx="94" cy="64" r="8" fill="#fff" ${K} stroke-width="2.5"/><path d="M90 70q2 6 0 8" ${K} stroke-width="2.5" fill="#fff"/>${hand(94, 84)}`;
    case 'lantern':
      return `${arm(38, 84, 34, 78)}${arm(82, 84, 90, 98)}${hand(90, 98)}
        <path d="M30 86q4-10 8 0" ${K} stroke-width="2.5" fill="none"/><rect x="26" y="86" width="16" height="16" rx="2" fill="#fff" ${K} stroke-width="2.5"/>
        <path d="M34 90v8M30 94h8" stroke="#000" stroke-width="2"/><path d="M20 90l-4-2M20 98l-4 2M48 90l4-2M48 98l4 2" stroke="#999" stroke-width="2" stroke-linecap="round"/>${hand(34, 78)}`;
    case 'mittens':
      return `${arm(38, 84, 32, 96)}${hand(32, 96, true)}${arm(82, 84, 88, 96)}${hand(88, 96, true)}`;
    case 'rush':
      return `${arm(38, 84, 24, 76)}${hand(24, 76)}${arm(82, 84, 96, 90)}
        <rect x="90" y="88" width="22" height="15" rx="2" fill="#333" ${K} stroke-width="2.5"/><path d="M97 88v-4h8v4" ${K} stroke-width="2.5" fill="none"/><path d="M90 95h22" stroke="#fff" stroke-width="1.5"/>${hand(96, 90)}`;
    default: // wave
      return `${arm(38, 84, 30, 96)}${hand(30, 96)}${arm(82, 84, 98, 66)}${hand(98, 66)}`;
  }
}

// Canopy above and to the left, stick coming down behind the head to the hand.
function umbrellaBehind(s) {
  const tilt = s.windy ? 'rotate(-12 28 40)' : '';
  return `<g transform="${tilt}">
    <path d="M28 40V82" ${K} stroke-width="3" fill="none"/><path d="M28 82q0 7 6 7" ${K} stroke-width="3" fill="none"/>
    <path d="M-8 40Q28 -4 64 40Z" fill="#fff" ${K} stroke-width="3"/>
    <path d="M-8 40q9-6 18 0t18 0t18 0t18 0" fill="#fff" ${K} stroke-width="3"/>
    <path d="M28 2V40M10 14l-10 26M46 14l10 26" stroke="#000" stroke-width="1.8" fill="none"/>
  </g>`;
}

function sun(x, y) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
    const r = (a * Math.PI) / 180, x1 = x + Math.cos(r) * 13, y1 = y + Math.sin(r) * 13, x2 = x + Math.cos(r) * 17, y2 = y + Math.sin(r) * 17;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }).join('');
  return `<circle cx="${x}" cy="${y}" r="9" fill="#fff" ${K} stroke-width="2.5"/><path d="${rays}" ${K} stroke-width="2.5"/>`;
}
const moon = (x, y) => `<path d="M${x} ${y - 11}a11 11 0 1 0 8 19a9 9 0 1 1-8-19z" fill="#fff" ${K} stroke-width="2.5"/>`;
const stars = () => `<path d="M14 12v6M11 15h6M30 30v4M28 32h4M84 10v4M82 12h4M112 44v4M110 46h4" ${K} stroke-width="2"/>`;
const cloud = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="M-14 10h26a7 7 0 0 0-1-14a9 9 0 0 0-17 3a6 6 0 0 0-8 11z" fill="#fff" ${K} stroke-width="2.5"/></g>`;
const rain = () => `<path d="M8 44l-2 7M20 50l-2 7M70 40l-2 7M84 48l-2 7M100 42l-2 7M112 54l-2 7" ${K} stroke-width="2.2"/>`;
const bolt = (x, y) => `<path d="M${x} ${y}l-8 14h7l-5 12 12-16h-7l5-10z" fill="#000" stroke="#fff" stroke-width="1.5"/>`;
const flakes = () => `<path d="M10 40m-3 0h6m-3-3v6m-2-2l4 4m0-4l-4 4M28 22m-3 0h6m-3-3v6m-2-2l4 4m0-4l-4 4M92 36m-3 0h6m-3-3v6m-2-2l4 4m0-4l-4 4M108 60m-3 0h6m-3-3v6m-2-2l4 4m0-4l-4 4M100 14m-3 0h6m-3-3v6m-2-2l4 4m0-4l-4 4" stroke="#000" stroke-width="1.6" stroke-linecap="round"/>`;
const fog = () => `<path d="M0 22h50M70 22h50M0 32h30M46 32h74M0 42h120" stroke="#b0b0b0" stroke-width="4" stroke-linecap="round"/>`;
const snowGround = () => `<path d="M0 114Q30 104 60 109T120 111V120H0z" fill="#fff" ${K} stroke-width="2.5"/>`;
const leaves = () => `<g fill="${LIGHT}" ${K} stroke-width="1.8"><ellipse cx="14" cy="109" rx="6" ry="3" transform="rotate(-20 14 109)"/><ellipse cx="104" cy="110" rx="6" ry="3" transform="rotate(15 104 110)"/><ellipse cx="116" cy="106" rx="5" ry="2.5" transform="rotate(-40 116 106)"/><ellipse cx="22" cy="96" rx="5" ry="2.5" transform="rotate(50 22 96)"/></g>`;
const flowers = () => `<path d="M14 112v-9M106 112v-10" ${K} stroke-width="2"/><circle cx="14" cy="100" r="4" fill="#fff" ${K} stroke-width="2"/><circle cx="106" cy="99" r="4" fill="#fff" ${K} stroke-width="2"/>`;
const grass = () => `<path d="M8 112l3-7 3 7M96 112l3-7 3 7M110 112l3-6 3 6M26 112l2-5 2 5" ${K} stroke-width="2" fill="none"/>`;
const puddle = () => `<ellipse cx="100" cy="113" rx="17" ry="4" fill="#d0d0d0" stroke="#888" stroke-width="2"/>`;
const tripod = () => `<path d="M100 82L90 112M100 82L110 112M100 82V112" ${K} stroke-width="2.5"/>`;
