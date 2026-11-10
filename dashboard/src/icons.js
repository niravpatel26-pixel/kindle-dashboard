// Stroke icons, 24x24 viewBox. Paths adapted from Lucide (ISC license).
const CLOUD = 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z';
const CLOUD_OPEN = 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242';
const SUN_RAYS = 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41';

export const ICONS = {
  'clear':               `<circle cx="12" cy="12" r="4.5"/><path d="${SUN_RAYS}"/>`,
  'mostly-clear':        `<circle cx="12" cy="12" r="4.5"/><path d="${SUN_RAYS}"/>`,
  'clear-night':         `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`,
  'partly-cloudy':       `<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.947 12.65a4 4 0 0 0-5.925-4.128M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>`,
  'partly-cloudy-night': `<path d="M10.188 8.5A6 6 0 0 1 16 4a1 1 0 0 0 6 6 6 6 0 0 1-3 5.197M13 16a3 3 0 1 1 0 6H7a5 5 0 1 1 4.9-6Z"/>`,
  'cloudy':              `<path d="${CLOUD}"/>`,
  'fog':                 `<path d="${CLOUD_OPEN}M16 17H7M17 21H9"/>`,
  'drizzle':             `<path d="${CLOUD_OPEN}M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1"/>`,
  'rain':                `<path d="${CLOUD_OPEN}M16 14v6M8 14v6M12 16v6"/>`,
  'showers':             `<path d="${CLOUD_OPEN}M16 14v6M8 14v6M12 16v6"/>`,
  'heavy-rain':          `<path d="${CLOUD_OPEN}M16 14v7M8 14v7M12 15v7M10 18v4M14 18v4"/>`,
  'snow':                `<path d="${CLOUD_OPEN}M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>`,
  'heavy-snow':          `<path d="${CLOUD_OPEN}M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01M10 21h.01M14 21h.01"/>`,
  'sleet':               `<path d="${CLOUD_OPEN}M8 15h.01M8 19h.01M16 15h.01M16 19h.01M12 16v6"/>`,
  'thunder':             `<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973M13 12l-3 5h4l-3 5"/>`,
  // detail glyphs
  'wind':      `<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2"/>`,
  'droplet':   `<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>`,
  'umbrella':  `<path d="M22 12a10.06 10.06 1 0 0-20 0ZM12 12v8a2 2 0 0 0 4 0M12 2v1"/>`,
  'sunrise':   `<path d="M12 2v8M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/>`,
  'sunset':    `<path d="M12 10V2M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M16 6l-4 4-4-4M16 18a4 4 0 0 0-8 0"/>`,
  'thermometer': `<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>`,
  'battery':   `<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M22 11v2"/>`,
  'train':     `<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M12 3v8M8 19l-2 3M16 19l2 3M8 15h.01M16 15h.01"/>`,
};

export function icon(name, cls = '') {
  const body = ICONS[name] ?? ICONS.cloudy;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function batteryIcon(pct) {
  const w = Math.max(0, Math.min(1, pct / 100)) * 12;
  return `<svg class="icon battery" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="2" y="7" width="16" height="10" rx="2"/><path d="M22 11v2"/><rect x="4" y="9" width="${w}" height="6" fill="currentColor" stroke="none"/></svg>`;
}
