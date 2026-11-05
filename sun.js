// Sun position and the geometry of the sun-path dial. Pure functions, no DOM, no three.js.
// A port of sun_dir() in 脚本/hardleaf_shade_minimal.py (NOAA approximation formulas); tests compare it with the Python values.
// The site is a placeholder (Zurich), as in the script; north angle 0 means model +Y is true north (unknown in reality).
export const SITE = { lat: 47.37, lon: 8.54, northDeg: 0 };
export const DATES = [{ iso: '2026-03-21', label: '21 Mar', note: 'Equinox' }, { iso: '2026-06-21', label: '21 Jun', note: 'Solstice' }, { iso: '2026-09-21', label: '21 Sep', note: 'Equinox' }, { iso: '2026-12-21', label: '21 Dec', note: 'Solstice' }];
export const HOUR_PRESETS = [6, 9, 12, 15, 18];     // common choices, NOT a standard: municipal shadow-study guidelines differ (see doc 34)
const rad = d => d * Math.PI / 180;

// EU rule: summer time from the last Sunday of March to the last Sunday of October (01:00 UTC); judged at 12:00 local on that date.
export function utcOffsetZurich(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const lastSun = (year, month0) => { const last = new Date(Date.UTC(year, month0 + 1, 0)); return last.getUTCDate() - last.getUTCDay(); };
  const start = Date.UTC(y, 2, lastSun(y, 2), 1), end = Date.UTC(y, 9, lastSun(y, 9), 1), t = Date.UTC(y, m - 1, d, 10);
  return t >= start && t < end ? 2 : 1;
}
export function dayOfYear(iso) { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1; }
export function dateFromFraction(f, year = 2026) { const n = Math.max(0, Math.min(364, Math.round(f * 364))); const t = new Date(Date.UTC(year, 0, 1 + n)); return t.toISOString().slice(0, 10); }

export function sunPos(iso, hour, tz = utcOffsetZurich(iso), site = SITE) {
  const g = 2 * Math.PI / 365 * (dayOfYear(iso) - 1 + (hour - 12) / 24);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hour * 60 + eq + 4 * site.lon - 60 * tz, ha = rad(tst / 4 - 180), phi = rad(site.lat);
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = (Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha)) + 2 * Math.PI) % (2 * Math.PI);
  const rel = az - rad(site.northDeg);
  return { altitude: alt * 180 / Math.PI, azimuth: az, dir: [Math.sin(rel) * Math.cos(alt), Math.cos(rel) * Math.cos(alt), Math.sin(alt)] };
}
// the sun's path over one day: points above the horizon, every `step` hours
export function dayArc(iso, step = 0.25, tz) { const out = []; for (let h = 0; h <= 24 + 1e-9; h += step) { const p = sunPos(iso, h, tz); if (p.altitude > 0) out.push({ hour: h, alt: p.altitude, az: p.azimuth }); } return out; }
export const sunrise = arc => arc.length ? arc[0].hour : null, sunset = arc => arc.length ? arc[arc.length - 1].hour : null;

// polar sky chart seen from above, north up, east right: the centre is the zenith, the rim the horizon
export function polar(altDeg, azRad, cx, cy, R) { const r = R * (1 - altDeg / 90); return { x: cx + r * Math.sin(azRad), y: cy - r * Math.cos(azRad) }; }
export function nearestHourOnArc(arc, x, y, cx, cy, R) { let best = null, bd = Infinity; for (const p of arc) { const q = polar(p.alt, p.az, cx, cy, R), d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = p; } } return best ? best.hour : null; }
