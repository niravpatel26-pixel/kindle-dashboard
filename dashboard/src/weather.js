// Open-Meteo: free, no API key. https://open-meteo.com/en/docs
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../out');
const CACHE = path.join(OUT, 'weather-cache.json');

// WMO weather interpretation codes → icon + label
const WMO = {
  0:  ['clear', 'Clear'],
  1:  ['mostly-clear', 'Mostly clear'],
  2:  ['partly-cloudy', 'Partly cloudy'],
  3:  ['cloudy', 'Overcast'],
  45: ['fog', 'Fog'],
  48: ['fog', 'Freezing fog'],
  51: ['drizzle', 'Light drizzle'],
  53: ['drizzle', 'Drizzle'],
  55: ['drizzle', 'Heavy drizzle'],
  56: ['sleet', 'Freezing drizzle'],
  57: ['sleet', 'Freezing drizzle'],
  61: ['rain', 'Light rain'],
  63: ['rain', 'Rain'],
  65: ['heavy-rain', 'Heavy rain'],
  66: ['sleet', 'Freezing rain'],
  67: ['sleet', 'Freezing rain'],
  71: ['snow', 'Light snow'],
  73: ['snow', 'Snow'],
  75: ['heavy-snow', 'Heavy snow'],
  77: ['snow', 'Snow grains'],
  80: ['showers', 'Light showers'],
  81: ['showers', 'Showers'],
  82: ['heavy-rain', 'Violent showers'],
  85: ['snow', 'Snow showers'],
  86: ['heavy-snow', 'Heavy snow showers'],
  95: ['thunder', 'Thunderstorm'],
  96: ['thunder', 'Thunderstorm, hail'],
  99: ['thunder', 'Thunderstorm, hail'],
};

export function describe(code, isDay = true) {
  const [icon, label] = WMO[code] ?? ['cloudy', 'Unknown'];
  if (!isDay && (icon === 'clear' || icon === 'mostly-clear')) return { icon: 'clear-night', label };
  if (!isDay && icon === 'partly-cloudy') return { icon: 'partly-cloudy-night', label };
  return { icon, label };
}

function buildUrl({ latitude, longitude, timezone }, units) {
  const p = new URLSearchParams({
    latitude, longitude,
    timezone: timezone || 'auto',
    temperature_unit: units.temperature === 'fahrenheit' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: units.wind === 'mph' ? 'mph' : 'kmh',
    forecast_days: '8',
    current: [
      'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
      'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m',
    ].join(','),
    hourly: [
      'temperature_2m', 'precipitation_probability', 'precipitation', 'weather_code', 'is_day',
    ].join(','),
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset',
      'precipitation_sum', 'precipitation_probability_max', 'wind_speed_10m_max',
    ].join(','),
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

// Returns the forecast with a `fetchedAt` timestamp. When Open-Meteo is
// unreachable the last successful answer is returned instead (any age), so a
// network blip never blanks the dashboard; the page shows how old it is.
export async function getWeather(config) {
  const maxAge = (config.cache?.weatherMinutes ?? 10) * 60 * 1000;
  let cached = null;
  try {
    const c = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (c.key === cacheKey(config)) cached = c;
  } catch { /* no cache */ }
  if (cached && Date.now() - cached.fetchedAt < maxAge) return { ...cached.data, fetchedAt: cached.fetchedAt };

  try {
    const res = await fetch(buildUrl(config.location, config.units), { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = await res.json();
    if (!data?.current || !data?.hourly?.time?.length || !data?.daily?.time?.length) throw new Error('Open-Meteo: unexpected response');
    const fetchedAt = Date.now();
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify({ fetchedAt, key: cacheKey(config), data }));
    return { ...data, fetchedAt };
  } catch (e) {
    if (cached) return { ...cached.data, fetchedAt: cached.fetchedAt, stale: e.message };
    throw e;
  }
}

function cacheKey(c) {
  return `${c.location.latitude},${c.location.longitude},${c.units.temperature},${c.units.wind}`;
}

export function compassPoint(deg) {
  const pts = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return pts[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}
