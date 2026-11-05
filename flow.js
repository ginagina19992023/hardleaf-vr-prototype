// The design process as a flowchart, and the recorded decisions as a branch tree.
// Pure functions returning SVG strings, so they can be tested without a browser.
export const FLOW_STEPS = [
  { id: 1, name: 'Intention', ask: 'Who is this for, how many people, and how much shade do you want?' },
  { id: 2, name: 'Stock', ask: 'What timber is there? Pieces can be cut shorter, never longer.' },
  { id: 3, name: 'Light', ask: 'Walk the current design and see where the light falls.' },
  { id: 4, name: 'Why', ask: 'Which region falls short, and which members cause it?' },
  { id: 5, name: 'Change', ask: 'Try a change within the stock: turn, widen, raise.' },
  { id: 6, name: 'Compare', ask: 'What did the change gain, and what did it cost?' },
  { id: 7, name: 'Decide', ask: 'Choose, say why, and say what you left behind.' },
];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// Clockwise loop: 1 → 2 → 3 → 4 on top, down to 5, back along the bottom to 7, then return to 1.
const NODE = { w: 74, h: 62 };
const SLOT = { 1: [4, 8], 2: [90, 8], 3: [176, 8], 4: [262, 8], 5: [262, 112], 6: [176, 112], 7: [90, 112] };

export function flowSVG(active = 1, visited = [], notes = {}) {
  const seen = new Set(visited), { w, h } = NODE;
  const arrow = (x1, y1, x2, y2) => `<line class="fl-edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#fl-head)"/>`;
  const edges = [
    ...[[1, 2], [2, 3], [3, 4]].map(([a, b]) => arrow(SLOT[a][0] + w, SLOT[a][1] + h / 2, SLOT[b][0] - 2, SLOT[b][1] + h / 2)),
    arrow(SLOT[4][0] + w / 2, SLOT[4][1] + h, SLOT[5][0] + w / 2, SLOT[5][1] - 2),
    ...[[5, 6], [6, 7]].map(([a, b]) => arrow(SLOT[a][0], SLOT[a][1] + h / 2, SLOT[b][0] + w + 2, SLOT[b][1] + h / 2)),
  ].join('');
  const back = `<path class="fl-back" d="M${SLOT[7][0]} ${SLOT[7][1] + h / 2} H${SLOT[1][0] + w / 2} V${SLOT[1][1] + h + 2}" marker-end="url(#fl-head)"/><text class="fl-backlabel" x="${SLOT[1][0] + w / 2 + 5}" y="${SLOT[1][1] + h + 28}">return</text>`;
  const nodes = FLOW_STEPS.map(s => {
    const [x, y] = SLOT[s.id], cls = s.id === active ? 'on' : seen.has(s.id) ? 'seen' : 'todo';
    return `<g class="fl-node ${cls}" data-flow-step="${s.id}" role="button" tabindex="0" aria-label="Step ${s.id}: ${esc(s.name)}" aria-current="${s.id === active ? 'step' : 'false'}"><title>${esc(s.ask)}</title><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/><text class="fl-name" x="${x + 7}" y="${y + 19}">${s.id} ${esc(s.name)}</text><text class="fl-note" x="${x + 7}" y="${y + 37}">${esc(clip(notes[s.id], 13))}</text><text class="fl-note" x="${x + 7}" y="${y + 51}">${esc(clip(notes[`${s.id}b`], 13))}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 340 182" role="group" aria-label="Design process flowchart"><defs><marker id="fl-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" class="fl-arrow"/></marker></defs>${edges}${back}${nodes}</svg>`;
}

// Inline branches after Heer et al. 2008 (p. 4): a tree takes a lot of screen space, so the strip lists each branch's
// contents in sequence, depth first, with sibling branches sorted by the time of their first item.
export function stripItems(story) {
  const kids = new Map(), hasParent = new Set(story.edges.map(e => e[1])), byId = new Map(story.nodes.map(n => [n.id, n]));
  for (const [p, q] of story.edges) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(q); }
  const order = id => byId.get(id)?.order ?? 0, out = [], seen = new Set();
  const walk = (id, from) => { if (seen.has(id) || !byId.has(id)) return; seen.add(id); const n = byId.get(id); out.push({ ...n, from });
    const next = [...(kids.get(id) || [])].sort((a, b) => order(a) - order(b)); for (const k of next) walk(k, id); };
  story.nodes.filter(n => !hasParent.has(n.id)).sort((a, b) => a.order - b.order).forEach(n => walk(n.id, null));
  return out;
}

// One history card, with a thumbnail, as HTML. info: {thumb, line}.
export function stripCardHTML(n, info = {}) {
  const tip = [n.title, info.line, n.sub, n.reason && `Reason: ${n.reason}`, 'Click to return here and open a new branch'].filter(Boolean).join('\n');
  return `<button type="button" class="hs-card ${esc(n.kind)}${n.head ? ' head' : ''}" data-restore="${esc(n.id)}" data-lane="${n.lane}" title="${esc(tip)}">${info.thumb ? `<img src="${esc(info.thumb)}" alt="">` : '<span class="hs-noimg"></span>'}<span class="hs-text"><b>${esc(clip(n.title, 22))}</b><small>${esc(clip(info.line || n.sub, 26))}</small><small class="hs-why">${esc(clip(n.reason, 26))}</small></span></button>`;
}

// The decision map as a tree: each card sits one column after its parent and each branch has its own row, so a fork is
// drawn from the card it really left from. Sizes can be raised for a printed figure.
export function treeSVG(story, info = {}, { W = 190, H = 62, GX = 26, GY = 12, TW = 82, room = null } = {}) {
  const X0 = 6, Y0 = 6, rootW = 54, parent = new Map(story.edges.map(([p, q]) => [q, p])), depth = new Map();
  const depthOf = id => { if (depth.has(id)) return depth.get(id); depth.set(id, 0); const p = parent.get(id), d = p ? depthOf(p) + 1 : 0; depth.set(id, d); return d; };
  const at = new Map(story.nodes.map(n => [n.id, { x: X0 + rootW + GX + depthOf(n.id) * (W + GX), y: Y0 + n.lane * (H + GY), n }]));
  const has = new Set(story.edges.map(e => e[1]));
  const curve = (x1, y1, x2, y2) => { const m = (x1 + x2) / 2; return `<path class="tr-edge${y1 === y2 ? '' : ' fork'}" d="M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}"/>`; };
  const rootY = Y0 + H / 2;
  const edges = story.edges.map(([p, q]) => { const A = at.get(p), B = at.get(q); return A && B ? curve(A.x + W, A.y + H / 2, B.x, B.y + H / 2) : ''; }).join('')
    + story.nodes.filter(n => !has.has(n.id)).map(n => { const B = at.get(n.id); return curve(X0 + rootW, rootY, B.x, B.y + H / 2); }).join('');
  const nodes = story.nodes.map(n => {
    const { x, y } = at.get(n.id), i = info[n.id] || {}, tx = i.thumb ? x + TW + 6 : x + 7, fit = room ?? (i.thumb ? 15 : 28), step = H / 3.4;
    return `<g class="tr-node ${esc(n.kind)}${n.head ? ' head' : ''}" data-restore="${esc(n.id)}" role="button" tabindex="0" aria-label="Return to ${esc(n.title)} and open a new branch"><title>${esc([n.title, i.line, n.reason && `Reason: ${n.reason}`, 'Click to return here and open a new branch'].filter(Boolean).join('\n'))}</title><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="6"/>${i.thumb ? `<image href="${esc(i.thumb)}" x="${x + 3}" y="${y + 3}" width="${TW}" height="${H - 6}" preserveAspectRatio="xMidYMid slice"/>` : ''}<text class="tr-title" x="${tx}" y="${y + step}">${esc(clip(n.title, fit))}</text><text class="tr-sub" x="${tx}" y="${y + step * 2}">${esc(clip(i.line || n.sub, fit + 2))}</text><text class="tr-sub" x="${tx}" y="${y + step * 3}">${esc(clip(n.reason, fit + 2))}</text></g>`;
  }).join('');
  const cols = Math.max(1, ...story.nodes.map(n => depthOf(n.id) + 1));
  const width = X0 * 2 + rootW + GX + cols * (W + GX), height = Y0 * 2 + story.lanes * (H + GY) - GY;
  const root = `<g class="tr-root"><rect x="${X0}" y="${rootY - 15}" width="${rootW}" height="30" rx="15"/><text x="${X0 + rootW / 2}" y="${rootY + 4}" text-anchor="middle">Start</text></g>`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="Decision branch tree">${edges}${root}${nodes}</svg>`;
}
