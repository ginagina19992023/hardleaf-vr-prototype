// The local search as a map: every point is one local change around the seating zone, already computed by local_search.py.
// The geometry is rebuilt here with the same formula, so a static page can show any point without a server.
const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

export function localRaiseBeams(beams, x, y, radius, height) {
  const lift = p => { const d = Math.hypot(p[0] - x, p[1] - y); return d < radius ? height * Math.cos(Math.PI * d / (2 * radius)) ** 2 : 0; };
  return beams.map(b => {
    const f = b.frame, end = f.point.map((v, i) => v + f.xaxis[i] * b.length), a = lift(f.point), e = lift(end);
    if (a === 0 && e === 0) return b;
    const p0 = [f.point[0], f.point[1], f.point[2] + a], p1 = [end[0], end[1], end[2] + e], v = sub(p1, p0), L = Math.hypot(...v), nx = v.map(c => c / L);
    const k = dot(f.yaxis, nx); let ny = f.yaxis.map((c, i) => c - k * nx[i]); const n = Math.hypot(...ny); ny = ny.map(c => c / n);
    return { ...b, length: L, frame: { ...f, point: p0, xaxis: nx, yaxis: ny } };
  });
}

export function decodeHours(hex, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = !!((parseInt(hex[i >> 2], 16) >> (3 - (i & 3))) & 1);
  return out;
}

const rowName = r => {
  const where = r.dx > 0 ? ', 1 m east' : r.dx < 0 ? ', 1 m west' : r.dy > 0 ? ', 1 m north' : r.dy < 0 ? ', 1 m south' : '';
  return `${r.height > 0 ? 'raised' : 'lowered'} ${Math.abs(r.height)} m, radius ${r.radius} m${where}`;
};
export const rowId = r => `ls_${r.dx}_${r.dy}_${r.radius}_${r.height}`.replace(/\./g, 'p').replace(/-/g, 'm');
export const rowTitle = r => `Local · ${rowName(r)}`;

// A full option in the data file's shape, from the original and one row. Only the 4-person seat figure was computed in the search.
export function buildLocalScenario(baseBeams, base, grid, row, search) {
  const n = grid.nx * grid.ny, hours = row.ground_hours.map(h => decodeHours(h, n)), cellMean = new Array(n), rad = new Array(n);
  for (let c = 0; c < n; c++) {
    let s = 0, wh = 0;
    hours.forEach((h, r) => { if (h[c]) s++; else wh += search.hour_wh[r]; });
    cellMean[c] = s / hours.length; rad[c] = wh / 1000;
  }
  const gr = { ...grid, cell_mean: cellMean, shade_per_hour: hours, radiation_kwh_m2: rad };
  const { _base, zone_grid, ...rest } = base;
  return { ...rest, id: rowId(row), label: rowTitle(row), strategy: 'param_variant', removed_beam_ids: [], beams: localRaiseBeams(baseBeams, search.centre[0] + row.dx, search.centre[1] + row.dy, row.radius, row.height),
    shade_grid: gr, ground_grid: gr, usage: {}, structure_proxy: null, stage_check: null, checks: null,
    results: { ...base.results, shade_mean: row.seat_shade, shade_per_hour: undefined },
    comparability: { ...base.comparability, same_stock: false, timber_length_m: row.timber_m, variables_changed: [rowName(row)], stock_fit: { feasible: row.fits_stock, longer_needed: row.longer_needed, shortfall_m: row.short_m, max_excess_m: row.max_excess_m, tolerance_m: search.tolerance_m, waste_m: null } },
    local_change: { kind: row.height > 0 ? 'raise' : 'lower', dx: row.dx, dy: row.dy, radius: row.radius, height: row.height, note: 'geometry only; joints and structure not checked' } };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Sign-agreement matters more than a best point: a filled mark holds at both samplings, a hollow one does not.
export const robustRow = r => Math.sign(r.delta_pp) === Math.sign(r.delta_pp_25cm);

export function localMapSVG(rows, selectedId = null) {
  const W = 420, H = 250, L = 46, R = 12, T = 14, B = 38, x = v => L + (v + 1) / 4 * (W - L - R), yMax = Math.sqrt(1.8), y = v => T + 30 + Math.sqrt(v) / yMax * (H - T - B - 30);
  const grid = [0, 1, 2, 3].map(v => `<line class="lm-grid" x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${H - B}"/><text class="lm-tick" x="${x(v)}" y="${H - B + 14}" text-anchor="middle">${v > 0 ? '+' : ''}${v}</text>`).join('');
  const yTicks = [0.5, 1.5].map(v => `<line class="lm-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="lm-tick" x="${L - 5}" y="${y(v) + 3}" text-anchor="end">${v} m</text>`).join('');
  const band = `<rect class="lm-band" x="${x(-1)}" y="${T}" width="${x(1) - x(-1)}" height="${H - T - B}"/><text class="lm-note" x="${x(0)}" y="${H - B - 4}" text-anchor="middle">under 1 point: not a conclusion</text>`;
  const lane = `<rect class="lm-lane" x="${L}" y="${T}" width="${W - L - R}" height="26"/><text class="lm-tick" x="${L - 5}" y="${T + 16}" text-anchor="end">fits</text>`;
  const marks = rows.map(r => {
    const id = rowId(r), cx = Math.max(x(-1), Math.min(x(3), x(r.delta_pp))), cy = r.fits_stock ? T + 13 + ((r.radius - 1.75) * 5) : y(r.short_m), up = r.height > 0, s = 5;
    const shape = up ? `M${cx} ${cy - s}L${cx + s} ${cy + s - 1}L${cx - s} ${cy + s - 1}Z` : `M${cx} ${cy + s}L${cx + s} ${cy - s + 1}L${cx - s} ${cy - s + 1}Z`;
    const tip = `${rowName(r)}\nSeat zone: ${r.delta_pp >= 0 ? '+' : ''}${r.delta_pp} points (10 cm), ${r.delta_pp_25cm >= 0 ? '+' : ''}${r.delta_pp_25cm} (25 cm)\n${r.fits_stock ? 'Fits the stock within 10 mm' : `${r.longer_needed} members over, short ${r.short_m} m`}\n${r.changed} members change`;
    return `<g class="lm-pt${r.fits_stock ? ' fit' : ''}${robustRow(r) ? ' firm' : ' soft'}${id === selectedId ? ' sel' : ''}" data-row="${esc(id)}" role="button" tabindex="0" aria-label="${esc(rowName(r))}"><title>${esc(tip)}</title><circle class="lm-hit" cx="${cx}" cy="${cy}" r="9"/><path d="${shape}"/></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Local search map">${band}${lane}${grid}${yTicks}<line class="lm-axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>${marks}<text class="lm-label" x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">Change in seat-zone shade, points (10 cm sampling)</text><text class="lm-label" transform="translate(11 ${(T + H - B) / 2 + 12}) rotate(-90)" text-anchor="middle">Timber short (m)</text></svg>`;
}
