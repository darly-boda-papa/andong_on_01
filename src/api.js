import { WEATHER_POINT } from './data.js';

async function getJson(url, { timeout = 10000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(body.message || `HTTP ${r.status}`);
      err.code = body.error || `HTTP_${r.status}`;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(t);
  }
}

const { lat, lng } = WEATHER_POINT;

export async function fetchWeather() {
  const [w, a] = await Promise.all([
    getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m` +
        `&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=Asia%2FSeoul&forecast_days=1`
    ),
    getJson(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
        `&current=pm10,pm2_5&timezone=Asia%2FSeoul`
    ).catch(() => null),
  ]);
  return { weather: w, air: a };
}

export const fetchNews = (q) => getJson(`/api/news${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const fetchTour = (type) => getJson(`/api/tour?type=${type}`);
export const searchBusStops = (q) => getJson(`/api/bus?mode=search&q=${encodeURIComponent(q)}`);
export const nearbyBusStops = (lat, lng) => getJson(`/api/bus?mode=nearby&lat=${lat}&lng=${lng}`);
export const fetchRoute = (routeId) => getJson(`/api/bus?mode=route&routeId=${encodeURIComponent(routeId)}`);
export const fetchArrivals = (nodeId) => getJson(`/api/bus?mode=arrivals&nodeId=${encodeURIComponent(nodeId)}`);

// WMO 날씨 코드 → 한글/아이콘
export function describeWeather(code, isDay = 1) {
  if (code === 0) return isDay ? ['맑음', 'ph-sun', 'text-amber-300'] : ['맑음', 'ph-moon-stars', 'text-indigo-300'];
  if (code <= 2) return ['구름조금', 'ph-cloud-sun', 'text-amber-200'];
  if (code === 3) return ['흐림', 'ph-cloud', 'text-stone-300'];
  if (code === 45 || code === 48) return ['안개', 'ph-cloud-fog', 'text-stone-300'];
  if (code >= 51 && code <= 67) return ['비', 'ph-cloud-rain', 'text-blue-300'];
  if (code >= 71 && code <= 77) return ['눈', 'ph-snowflake', 'text-sky-200'];
  if (code >= 80 && code <= 82) return ['소나기', 'ph-cloud-rain', 'text-blue-300'];
  if (code >= 85 && code <= 86) return ['눈', 'ph-snowflake', 'text-sky-200'];
  if (code >= 95) return ['뇌우', 'ph-cloud-lightning', 'text-yellow-300'];
  return ['흐림', 'ph-cloud', 'text-stone-300'];
}

// 한국 환경부 기준 (㎍/㎥)
export function gradeDust(pm25, pm10) {
  if (pm25 == null && pm10 == null) return null;
  const g = (v, cuts) => {
    if (v == null) return 0;
    const i = cuts.findIndex((c) => v <= c);
    return i === -1 ? 3 : i;
  };
  const idx = Math.max(g(pm25, [15, 35, 75]), g(pm10, [30, 80, 150]));
  return [
    ['좋음', 'text-sky-300'],
    ['보통', 'text-emerald-400'],
    ['나쁨', 'text-orange-400'],
    ['매우나쁨', 'text-red-400'],
  ][idx];
}
