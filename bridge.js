// Client for the local live compute bridge. Every call has a timeout.
export class Bridge {
  // not `this.f = fetch`: calling the browser's fetch as a method of another object throws 'Illegal invocation'
  constructor(url, fetchFn = globalThis.fetch) { this.url = String(url).replace(/\/$/, ''); this.f = (...args) => fetchFn(...args); this.on = false; this.ms = null; this.calls = 0; }
  async _json(path, body, timeout = 4000) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout), t0 = performance.now();
    try {
      const r = await this.f(this.url + path, body === undefined ? { signal: ctl.signal } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      const j = await r.json(); this.ms = Math.round(performance.now() - t0); this.calls += 1; return j;
    } finally { clearTimeout(timer); }
  }
  async connect() { try { const h = await this._json('/health', undefined, 1200); this.on = !!h.ok; return h; } catch { this.on = false; return null; } }
  async shade(req) { try { const j = await this._json('/shade', req); this.on = !j.error; return j; } catch (e) { this.on = false; return { error: String(e) }; } }
  async contact(req) { try { return await this._json('/contact', req); } catch (e) { return { error: String(e) }; } }
  async generate(req) { try { return await this._json('/generate', req, 8000); } catch (e) { return { error: String(e) }; } }
  async job(id) { try { return await this._json('/job?id=' + encodeURIComponent(id), undefined, 8000); } catch (e) { return { error: String(e) }; } }
  async exact(req) { try { return await this._json('/exact', req, 60000); } catch (e) { return { error: String(e) }; } }
  async engine(req) { try { return await this._json('/engine', req, 75000); } catch (e) { return { error: String(e) }; } }
}
const TURN = { opt_rot45: 45, opt_rot90: 90, opt_rot135: 135 };
// geometry of one scenario as the bridge understands it: its own beams, or the original minus removed members, turned if it is a turned option
export function shadeRequest(scenario, when, seat, step) {
  const req = { date: when.iso, hour: when.hour, seat: { x_min: seat.x_min, x_max: seat.x_max, y_min: seat.y_min, y_max: seat.y_max }, step };
  if (scenario.beams) req.beams = scenario.beams; else { req.removed = scenario.removed_beam_ids; if (TURN[scenario.id]) req.rotate_deg = TURN[scenario.id]; }
  return req;
}
