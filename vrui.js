// Headset interface: layout, hit-testing and drawing as pure functions (no three.js), so they can be unit-tested.
// English, translucent ("glass") panels, little text, colour first. Rules (thesis doc 27, AUIT, Wingler, Graphical Histories):
//  - the model is never covered (AUIT: Avoid Occlusion): a tilted console at waist height, wings to the sides, a test keeps it so
//  - one goal, one card, with a status; data identity stays visible; panels move only when asked or after a large turn, eased
//  - the sun-path dial is the time control: drag along the arc, or jump with the presets
import { polar } from './sun.js';
export const W = 1024, H = 768;
export const SIZES = { left: { w: 1.2, h: 0.9, px: [1024, 768] }, centre: { w: 1.2, h: 0.9, px: [1024, 768] }, right: { w: 1.2, h: 0.9, px: [1024, 768] }, sun: { w: 0.9, h: 1.0, px: [900, 1000] }, context: { w: 0.55, h: 0.5, px: [550, 500] } };
export const PANEL_M = SIZES.left;
export const screenSize = id => SIZES[id] || SIZES.left;
const C = { ink: '#16261d', mute: '#52645a', line: 'rgba(22,38,29,.38)', glass: 'rgba(255,255,255,.50)', glass2: 'rgba(255,255,255,.72)', ok: '#1f7a4a', warn: '#b07d0f', bad: '#b3392f', blue: '#1f5fa8', grey: '#8a958f', accent: '#1f5a3c', white: '#ffffff' };
const FONT = 'Inter, "Segoe UI", Helvetica, Arial, sans-serif';

// ---- placement: user-triggered, eased (AUIT triggers and transitions) --------------------------------------------
export function placePanels(head, yaw, o = {}) {
  const side = ((o.sideDeg ?? 62) * Math.PI) / 180, d = o.distance ?? 1.5;
  const at = (a, dist, drop, tilt = 0) => ({ x: head.x - Math.sin(a) * dist, y: head.y - drop, z: head.z - Math.cos(a) * dist, rotY: a, tiltX: tilt });
  const cd = o.consoleDistance ?? 0.9, cdrop = o.consoleDrop ?? 0.9;
  return { left: at(yaw + side, d, 0.1), centre: at(yaw, cd, cdrop, -Math.atan2(cdrop, cd)), sun: at(yaw - side, d, 0.1), right: at(yaw - side - (50 * Math.PI) / 180, d, 0.1) };
}
export function angularRect(head, pts) {
  const ys = [], ps = [];
  for (const p of pts) { const dx = p.x - head.x, dy = p.y - head.y, dz = p.z - head.z; ys.push(Math.atan2(-dx, -dz) * 180 / Math.PI); ps.push(Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI); }
  return { y0: Math.min(...ys), y1: Math.max(...ys), p0: Math.min(...ps), p1: Math.max(...ps) };
}
export const rectsOverlap = (a, b) => a.y0 < b.y1 && b.y0 < a.y1 && a.p0 < b.p1 && b.p0 < a.p1;
export function panelCorners(pos, w = PANEL_M.w, h = PANEL_M.h) {
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    let x = sx * w / 2, y = sy * h / 2, z = 0;
    const ct = Math.cos(pos.tiltX || 0), st = Math.sin(pos.tiltX || 0); const y2 = y * ct - z * st, z2 = y * st + z * ct; y = y2; z = z2;
    const cy = Math.cos(pos.rotY), sy_ = Math.sin(pos.rotY); const x3 = x * cy + z * sy_, z3 = -x * sy_ + z * cy;
    out.push({ x: pos.x + x3, y: pos.y + y, z: pos.z + z3 });
  }
  return out;
}
export function angleDiffDeg(a, b) { let d = ((a - b) * 180) / Math.PI; d = ((d + 180) % 360 + 360) % 360 - 180; return Math.abs(d); }
export const needsReplace = (prevYaw, yaw, thresholdDeg = 50) => angleDiffDeg(prevYaw, yaw) > thresholdDeg;
export const easeToward = (cur, target, dt, tau = 0.25) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

// ---- decision-chain layout (time order on x, design branch on y) -------------------------------------------------
const SHOWN = new Set(['decision', 'resume-and-branch', 'goal', 'scenario', 'ack']);
export function branchLayout(events) {
  const byId = new Map(events.map(e => [e.id, e]));
  const nodes = events.filter(e => SHOWN.has(e.action)).map((e, i) => ({ id: e.id, order: i, lane: Math.max(0, parseInt(String(e.branch).slice(1), 10) - 1 || 0), action: e.action, decision: e.action === 'decision', goal: e.action === 'goal' }));
  const shown = new Set(nodes.map(n => n.id)), edges = [];
  for (const n of nodes) { let p = byId.get(n.id)?.parentStateEventId, g = 0; while (p && !shown.has(p) && g++ < 500) p = byId.get(p)?.parentStateEventId; if (p && shown.has(p)) edges.push([p, n.id]); }
  return { nodes, edges };
}

// ---- the decision chain as a story-branch map: one card per decision, intention version or return; branches on their own rows ----------
const STORY = new Set(['decision', 'goal', 'resume-and-branch', 'generate']);
export function storyLayout(events, titles = {}, headId = null, maxShown = 6) {
  const byId = new Map(events.map(e => [e.id, e])), all = events.filter(e => STORY.has(e.action)), shown = new Set(all.map(e => e.id));
  const near = id => { let p = id, g = 0; while (p && !shown.has(p) && g++ < 500) p = byId.get(p)?.parentStateEventId; return p && shown.has(p) ? p : null; };
  const card = e => {
    if (e.action === 'decision') return { kind: 'decision', title: titles[e.state?.scenario] || e.state?.scenario || 'Decision', sub: `Preference ${e.preference ?? '—'} · I${e.state?.goalVersion || 1}`, reason: e.rationale || null };
    if (e.action === 'generate') return { kind: 'option', title: titles[e.state?.scenario] || e.id_ || 'New option', sub: `asked: ${String(e.text || '').slice(0, 22)}` };
    if (e.action === 'goal') { const r = Object.values(e.roles || e.state?.roles || {}); return { kind: 'goal', title: `Intention ${e.goalId || 'I' + (e.state?.goalVersion || '')}`, sub: `${r.filter(x => x === 'core').length} core · ${r.filter(x => x === 'ignore').length} ignored` }; }
    const from = byId.get(e.restoredFromEventId)?.state?.scenario; return { kind: 'branch', title: `Back to ${titles[from] || e.restoredFromEventId}`, sub: `new branch ${e.branch}` };
  };
  const nodes = all.map((e, i) => ({ id: e.id, order: i, lane: Math.max(0, parseInt(String(e.branch).slice(1), 10) - 1 || 0), hasThumb: !!e.thumb, ...card(e) }));
  const skip = Math.max(0, nodes.length - maxShown), keep = new Set(nodes.slice(skip).map(n => n.id));
  const edges = []; for (const n of nodes) { if (!keep.has(n.id)) continue; const ev = byId.get(n.id), p = near(ev?.restoredFromEventId || ev?.parentStateEventId); if (p && keep.has(p)) edges.push([p, n.id]); }
  const head = near(headId);
  return { nodes: nodes.slice(skip).map((n, i) => ({ ...n, col: i, head: n.id === head })), edges, earlier: skip, lanes: Math.max(1, ...nodes.slice(skip).map(n => n.lane + 1)) };
}

// ---- widgets -------------------------------------------------------------------------------------------------------
const OPTION_BUTTONS = [['all', 'Original'], ['opt_raise20', 'Raised · fitted'], ['opt_rot90', 'Turn 90°'], ['opt_low', '15% lower'], ['opt_wide', '10% wider'], ['sys_arch', 'Arches'], ['sys_portal', 'Portal'], ['next', 'More ▶']];
const t = (x, y, w, size, text, color = C.ink, bold = false) => ({ t: 'text', x, y, w, size, text, color, bold });
const slider = (ids, labels, x, y, w, h, index, disabled = false) => ({ t: 'slider', ids, labels, x, y, w, h, index, disabled });
const btn = (id, label, x, y, w, h, active = false, disabled = false) => ({ t: 'btn', id, label, x, y, w, h, active, disabled });
const chip = (x, y, w, h, status, label) => ({ t: 'chip', x, y, w, h, status, label });
const stat = (x, y, w, big, small, status = 'ok') => ({ t: 'stat', x, y, w, big, small, status });
export const ROLE_LABEL = { core: 'Core', constraint: 'Constraint', ignore: 'Ignore' };
const ST = { ok: '✔ met', bad: '✘ not met', unknown: 'not computed' };
export const fmtTime = h => { let hh = Math.floor(h), mm = Math.round((h - hh) * 60); if (mm === 60) { hh += 1; mm = 0; } return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
export const DATES_UI = [{ iso: '2026-03-21', label: '21 Mar', note: 'Equinox' }, { iso: '2026-06-21', label: '21 Jun', note: 'Solstice' }, { iso: '2026-09-21', label: '21 Sep', note: 'Equinox' }, { iso: '2026-12-21', label: '21 Dec', note: 'Solstice' }];

// s: plain data prepared by the app. Nothing here touches three.js or the DOM.
export function buildScreens(s) {
  const goals = s.goals || [];
  // ---- left: data identity and design intention ----
  const lw = [t(24, 66, 976, 24, `Users: ${s.intent.users}`, C.ink, true), t(24, 98, 976, 24, `Uses: ${s.intent.uses}`, C.ink), t(24, 138, 976, 20, 'Goals: tap the button to change Core / Constraint / Ignore', C.mute)];
  goals.forEach((g, i) => { const y = 164 + i * 44, r = s.intent.roles[g.id];   // 7 goals at 44 px pitch: the list ends above the data note at y 484
    lw.push(t(24, y + 9, 540, 24, g.label, r === 'ignore' ? C.grey : C.ink, r === 'core'), btn('role:' + g.id, ROLE_LABEL[r], 590, y, 190, 40, r === 'core', !s.ack), chip(800, y, 200, 40, r === 'ignore' ? 'grey' : g.status, r === 'ignore' ? '—' : ST[g.status])); });
  // lower block on a fixed grid: one line of note, then the people choice, the intention, the confirm button, and the assumptions at the foot
  lw.push(t(24, 488, 976, 18, 'Data: green = brief · amber = assumed here · grey = not included (plants, weather, neighbours)', C.mute),
    t(24, 522, 700, 18, 'People in the seating zone (assumed 1.5 m² each)', C.mute),
    slider(s.usage.options.map(u => u.id), s.usage.options.map(u => `${u.persons}`), 60, 546, 880, 54, Math.max(0, s.usage.options.findIndex(u => u.id === s.usage.id)), !s.ack),
    t(24, 616, 976, 24, `Intention I${s.goalVersion} · shade ≥ ${Math.round(s.target * 100)}% · ${fmtTime(s.hour)} · ${s.seatLine}`, C.ink, true),
    s.ack ? btn('goal', `Confirm intention I${s.goalVersion + 1}`, 24, 656, 480, 52, true) : btn('ack', 'I understand these limits', 24, 656, 480, 52, true),
    t(530, 656, 470, 22, s.ack ? 'Confirm after changing roles or people: it becomes a version' : 'Confirm the limits first', C.mute),
    t(530, 697, 180, 18, `Eye height ${(s.eyeHeight ?? 1.6).toFixed(2)} m`, C.ink), btn('eye:-', '−5 cm', 720, 690, 86, 36, false), btn('eye:reset', '1.60', 812, 690, 86, 36, false), btn('eye:+', '+5 cm', 904, 690, 86, 36, false),
    t(24, 734, 976, 18, `Assumed: ${s.sun?.iso || ''} ${fmtTime(s.hour)} · target ${Math.round(s.target * 100)}% (demo) · bare frame, direct light · north unknown`, C.mute));
  const left = { id: 'left', title: 'INTENT', widgets: lw };

  // ---- centre: choose a spatial comparison; the evidence lives on the models ----
  const v=s.visual||{},f=v.facts,e=v.explanation||{headline:'Choose two options and look at the models.',why:'Ground outlines show area; rulers show height; light marks show shade changes.'};
  const cw=[];
  OPTION_BUTTONS.forEach(([id,label],i)=>cw.push(btn('scn:'+id,label,20+i*123,66,117,52,s.cur.id===id,!s.ack)));
  cw.push(t(20,132,660,22,`B / ${s.ref.title}`,C.blue),btn('ref','Use current as B',700,126,304,40,false,!s.ack));
  [['single','Single'],['beside','Beside'],['overlay','Overlap']].forEach(([id,label],i)=>cw.push(btn('layout:'+id,label,20+i*185,184,174,48,(v.mode||'beside')===id,!s.ack)));
  cw.push(btn('ref:next','Next reference',590,184,210,48,false,!s.ack),btn('compare','Hide / show B',814,184,190,48,false,!s.ack));
  [['all','All'],['area','Area'],['shade','Shade'],['height','Height'],['material','Timber']].forEach(([id,label],i)=>cw.push(btn('focus:'+id,label,20+i*198,250,186,52,(v.focus||'all')===id,!s.ack)));
  if(!s.ack)cw.push(t(28,334,960,27,'Confirm the data limits on the left, then compare in 3D.',C.warn,true));
  else{
    const detail=s.level===3?e.why.replace(/ A:.*$/, ''):s.level===2&&f?.changes?`${f.changes.changed.length} members changed (1 mm tolerance) · ${f.changes.same.length} unchanged`:'Follow the coloured models. Choose a lens or select a ground region.';
    cw.push(t(28,324,960,29,e.headline,C.ink,true),t(28,404,960,23,detail,C.mute),
      chip(20,512,474,40,'warn','A / current · orange'),chip(510,512,494,40,'blue','B / reference · blue ghost'));
    if(f)cw.push(t(28,477,960,18,`A: ${f.stockA?.text||'Stock fit unknown'} · length only; joints unchecked`,f.stockA?.fits===false?C.warn:C.mute));
  }
  if(s.mr?.active)cw.push(btn('place:move','Move model',20,570,245,46,!!s.mr.placing,false),
    btn('place:left','Rotate −15°',280,570,220,46,false,false),btn('place:right','Rotate +15°',515,570,245,46,false,false),
    btn('place:confirm','Place here',775,570,229,46,false,!s.mr.ready));
  else cw.push(btn('overlap:local',v.local?'Whole overlap':'Local overlap',20,570,245,46,!!v.local,!s.ack||v.mode!=='overlay'),
    btn('ghost','Ghost opacity',280,570,220,46,false,!s.ack||v.mode!=='overlay'),btn('diffonly','Only what changed',515,570,245,46,!!v.differencesOnly,!s.ack),
    btn('region:clear','Clear region',775,570,229,46,false,!s.ack||!s.region));
  cw.push(btn('mode',s.viewMode==='day'?'Whole day':s.viewMode==='hour'?'This hour':'Direct radiation',20,632,180,42,false,!s.ack),btn('cells',s.showCells?'Hide light cells':'Show light cells',214,632,230,42,false,!s.ack),
    btn('level:1','Overview',458,632,170,42,s.level===1,!s.ack),btn('level:2','Differences',642,632,170,42,s.level===2,!s.ack),btn('level:3','Explain',826,632,178,42,s.level===3,!s.ack),
    t(20,696,984,18,s.mr?.active?(s.mr.error||'Look at a real floor: trigger places the 1:1 model · X moves it again · A rotates it'):s.viewMode==='radiation'?`Ground: blue = 0 · pale = ${s.radiationMax?.toFixed(2)??'?'} kWh/m² direct light (clear sky, 21 Jun)`:s.viewMode==='day'?'Ground: red = below shade target · blue = above target (21 Jun)':'Ground: pale = sun · blue = shade · grey = no hourly result',C.mute),
    t(20,731,984,17,s.mr?.active?'Room placement is visual; the stored radiation is for the assumed research site.':s.cur.struct&&s.cur.struct!=='not done'?`Structure: ${s.cur.struct}`:'Direct-light comparison · structure not checked',C.mute));
  const centre={id:'centre',title:'COMPARE IN SPACE',widgets:cw};

  // ---- sun and time: the polar sun-path dial is the time control ----
  const u = s.sun, [SW, SH] = SIZES.sun.px, cx = SW / 2, cy = 330, R = 250, sw = [];
  sw.push({ t: 'dial', x: cx, y: cy, R, arc: u.arc, arcSummer: u.arcSummer, arcWinter: u.arcWinter, sun: u.sun, marks: u.marks, label: u.label });
  sw.push(t(24, 700, 400, 22, 'Time of day', C.mute));
  [6, 9, 12, 15, 18].forEach((h, i) => sw.push(btn('hour:' + h, `${h}:00`, 24 + i * 172, 726, 160, 48, Math.abs(u.hour - h) < 0.01, !u.hoursUp[h])));
  sw.push(t(24, 792, 400, 22, 'Day of the year', C.mute), { t: 'year', x: 40, y: 826, w: SW - 80, h: 24, frac: u.frac, marks: u.yearMarks });
  DATES_UI.forEach((d, i) => sw.push(btn('date:' + d.iso, d.label, 24 + i * 214, 862, 202, 52, u.iso === d.iso, false), t(24 + i * 214 + 8, 920, 190, 18, d.note, C.mute)));
  sw.push(chip(24, 950, 852, 36, u.live.on ? 'ok' : 'grey', u.live.on ? `LIVE light · ${u.live.ms} ms` : 'PRECOMPUTED · 21 Jun, 10–17 h (start the bridge for any time)'));
  const sunScreen = { id: 'sun', title: 'SUN & TIME', widgets: sw, w: SW, h: SH };

  // ---- decisions and chain ----
  const rw = [t(24, 70, 400, 22, 'Preference for this configuration', C.mute)];
  [1, 2, 3, 4, 5].forEach((n, i) => rw.push(btn('pref:' + n, String(n), 24 + i * 78, 98, 70, 52, s.pref === n, !s.ack)));
  rw.push(btn('record', 'Record decision', 440, 98, 270, 52, true, !s.ack), btn('recenter', 'Re-centre panels', 730, 98, 270, 52, false, false));
  rw.push(t(24, 598, 976, 20, 'Ask for a new option (own scripts on the PC; Rhino when its worker is connected)', C.mute));
  [['turn 90', 'Turn 90°'], ['raise 10', 'Raise 10%'], ['raise 20', 'Raise 20%'], ['reset', 'Original']].forEach(([c, l], i) => rw.push(btn('cmd:' + c, l, 24 + i * 245, 622, 232, 48, false, !s.ack || !s.bridgeOn || (s.gen && s.gen.state === 'running'))));
  rw.push(t(24, 678, 976, 20, !s.bridgeOn ? 'Needs the bridge on the PC' : (s.gen && s.gen.text) || 'Not asked yet', s.gen && s.gen.state === 'error' ? C.warn : C.mute));
  rw.push(btn('rack', s.rackOn ? 'Hide timber stock rack' : 'Show timber stock rack', 24, 706, 360, 48, !!s.rackOn, !s.ack),btn('stock:band',`Length: ${s.stockBandLabel||'All'}`,398,706,320,48,false,!s.rackOn),btn('engine','Test Rhino link',730,706,270,48,false,!s.ack||!s.bridgeOn));
  rw.push(t(24, 166, 976, 22, s.story.nodes.length ? `Decision map · tap a card to return to it and branch${s.story.earlier ? ` · ${s.story.earlier} earlier not shown` : ''}` : 'Decision map · nothing recorded yet', C.mute));
  const CW = 150, CH = 150, laneY = l => 222 + l * 172, n = s.story.nodes.length, stepX = n > 1 ? Math.min(CW + 22, (976 - CW) / (n - 1)) : 0, at = new Map();
  s.story.nodes.forEach(nd => at.set(nd.id, { x: 24 + nd.col * stepX, y: laneY(nd.lane) }));
  for (let l = 0; l < s.story.lanes; l++) rw.push(t(24, laneY(l) - 20, 200, 16, l === 0 ? 'main line' : `branch b${l + 1}`, C.grey));
  s.story.edges.forEach(([p, q]) => { const A = at.get(p), B = at.get(q); if (A && B) rw.push({ t: 'edge', x1: A.x + CW, y1: A.y + CH / 2, x2: B.x, y2: B.y + CH / 2 }); });
  s.story.nodes.forEach(nd => { const p = at.get(nd.id); rw.push({ t: 'story', id: 'restore:' + nd.id, x: p.x, y: p.y, w: CW, h: CH, kind: nd.kind, title: nd.title, sub: nd.sub, head: nd.head, img: s.thumbs?.[nd.id] || null }); });
  let context = null;
  if (s.ctx) {
    const cx = [t(24, 66, 500, 28, s.ctx.title, C.ink, true), t(24, 98, 500, 20, s.ctx.sub, C.mute)];
    s.ctx.actions.forEach((a, k) => { const y = 128 + k * 60; cx.push(btn('ctx:' + a.id, a.label, 24, y, 236, 48, false, !a.enabled), t(270, y + 15, 262, 18, a.note, C.mute)); });
    (s.ctx.result || []).forEach((l, k) => cx.push(t(24, 128 + s.ctx.actions.length * 60 + 10 + k * 24, 500, 20, l, k === 0 ? C.ink : C.mute, k === 0)));
    context = { id: 'context', title: 'SELECTED', w: 550, h: 500, widgets: cx };
  }
  return { ...(context ? { context } : {}), left, centre, sun: sunScreen, right: { id: 'right', title: 'DECISIONS', widgets: rw } };
}

// ---- hit test: uv origin is bottom-left (three.js), the screen origin is top-left ---------------------------------
export function hitWidget(screen, u, v) {
  const pw = screen.w || W, ph = screen.h || H, x = u * pw, y = (1 - v) * ph;
  for (const w of screen.widgets) {
    if (w.t === 'btn' && !w.disabled && x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return w.id;
    if (w.t === 'node' && Math.hypot(x - w.x, y - w.y) <= w.r + 8) return w.id;
    if (w.t === 'story' && x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return w.id;
    if (w.t === 'dial' && Math.hypot(x - w.x, y - w.y) <= w.R + 14) return `dial:${((x - w.x) / w.R).toFixed(4)},${((y - w.y) / w.R).toFixed(4)}`;
    if (w.t === 'slider' && !w.disabled && x >= w.x - 30 && x <= w.x + w.w + 30 && y >= w.y - 6 && y <= w.y + w.h + 6) { const n = w.ids.length, i = Math.max(0, Math.min(n - 1, Math.round((x - w.x) / (w.w / (n - 1))))); return `usage:${w.ids[i]}`; }
    if (w.t === 'year' && x >= w.x - 8 && x <= w.x + w.w + 8 && y >= w.y - 12 && y <= w.y + w.h + 12) return `year:${Math.max(0, Math.min(1, (x - w.x) / w.w)).toFixed(4)}`;
  }
  return null;
}

// ---- drawing ---------------------------------------------------------------------------------------------------------
function wrapText(ctx, text, maxW) {
  const out=[];let line='';
  for(const token of String(text).split(/(\s+)/)){
    if(ctx.measureText(line+token).width>maxW&&line){out.push(line.trimEnd());line='';}
    for(const ch of token){if(ctx.measureText(line+ch).width>maxW&&line){out.push(line);line='';}line+=ch;}
    if(!line.trim())line='';
  }
  if(line)out.push(line.trimEnd());return out;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const TINT = { ok: 'rgba(31,122,74,.16)', bad: 'rgba(179,57,47,.16)', warn: 'rgba(176,125,15,.18)', grey: 'rgba(138,149,143,.18)', blue: 'rgba(68,131,160,.14)' };
export function drawScreen(ctx, screen) {
  const pw = screen.w || W, ph = screen.h || H;
  ctx.clearRect(0, 0, pw, ph);
  rr(ctx, 1, 1, pw - 2, ph - 2, 10); ctx.fillStyle = C.glass; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = C.accent; ctx.font = `700 22px ${FONT}`; ctx.textBaseline = 'alphabetic'; ctx.fillText(screen.title, 24, 40);
  ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(24, 52); ctx.lineTo(pw - 24, 52); ctx.stroke();
  for (const w of screen.widgets) {
    if (w.t === 'text') { ctx.fillStyle = w.color; ctx.font = `${w.bold ? '700' : '400'} ${w.size}px ${FONT}`; ctx.textBaseline = 'top'; wrapText(ctx, w.text, w.w).forEach((l, i) => ctx.fillText(l, w.x, w.y + i * (w.size + 6))); }
    else if (w.t === 'btn') { rr(ctx, w.x, w.y, w.w, w.h, 6); ctx.fillStyle = w.disabled ? 'rgba(255,255,255,.22)' : w.active ? C.accent : C.glass2; ctx.fill(); ctx.strokeStyle = w.disabled ? 'rgba(22,38,29,.18)' : w.active ? C.accent : C.line; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = w.disabled ? 'rgba(22,38,29,.35)' : w.active ? C.white : C.ink; ctx.font = `600 ${w.h < 46 ? 21 : 24}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(w.label, w.x + w.w / 2, w.y + w.h / 2 + 1, w.w - 10); ctx.textAlign = 'left'; }
    else if (w.t === 'chip') { rr(ctx, w.x, w.y, w.w, w.h, 6); ctx.fillStyle = TINT[w.status] || TINT.grey; ctx.fill(); ctx.strokeStyle = C[w.status] || C.grey; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = C.ink; ctx.font = `600 ${w.h < 40 ? 19 : 21}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(w.label, w.x + w.w / 2, w.y + w.h / 2 + 1, w.w - 16); ctx.textAlign = 'left'; }
    else if (w.t === 'stat') { rr(ctx, w.x, w.y, w.w, 124, 8); ctx.fillStyle = C.glass2; ctx.fill(); ctx.strokeStyle = C[w.status] || C.grey; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = C[w.status] || C.ink; ctx.font = `700 54px ${FONT}`; ctx.textBaseline = 'top'; ctx.fillText(w.big, w.x + 18, w.y + 12); ctx.fillStyle = C.mute; ctx.font = `400 21px ${FONT}`; ctx.fillText(w.small, w.x + 18, w.y + 86); }
    else if (w.t === 'line') { ctx.strokeStyle = C.grey; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke(); }
    else if (w.t === 'node') { ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.fillStyle = w.decision ? C.accent : w.goal ? C.warn : C.glass2; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.stroke(); }
    else if (w.t === 'edge') { ctx.strokeStyle = C.grey; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.bezierCurveTo(w.x1 + 30, w.y1, w.x2 - 30, w.y2, w.x2, w.y2); ctx.stroke(); }
    else if (w.t === 'story') drawStory(ctx, w);
    else if (w.t === 'dial') drawDial(ctx, w);
    else if (w.t === 'slider') drawSlider(ctx, w);
    else if (w.t === 'year') drawYear(ctx, w);
  }
}
function drawDial(ctx, w) {
  const { x: cx, y: cy, R } = w;
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  for (const a of [30, 60]) { ctx.beginPath(); ctx.arc(cx, cy, R * (1 - a / 90), 0, Math.PI * 2); ctx.stroke(); }
  for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.sin(k * Math.PI / 2), cy - R * Math.cos(k * Math.PI / 2)); ctx.stroke(); }
  ctx.fillStyle = C.mute; ctx.font = `700 22px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - R - 16); ctx.fillText('S', cx, cy + R + 16); ctx.fillText('E', cx + R + 16, cy); ctx.fillText('W', cx - R - 16, cy);
  ctx.font = `400 16px ${FONT}`; ctx.fillText('30°', cx + 6, cy - R * (1 - 30 / 90) + 11); ctx.fillText('60°', cx + 6, cy - R * (1 - 60 / 90) + 11);
  const path = (arc, color, wd, dash) => { if (!arc || arc.length < 2) return; ctx.beginPath(); arc.forEach((p, i) => { const q = polar(p.alt, p.az, cx, cy, R); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.strokeStyle = color; ctx.lineWidth = wd; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]); };
  path(w.arcSummer, 'rgba(176,125,15,.55)', 2, [6, 6]); path(w.arcWinter, 'rgba(31,95,168,.55)', 2, [6, 6]); path(w.arc, C.accent, 7, []);   // the day's arc is the slider
  ctx.font = `600 20px ${FONT}`;
  for (const m of w.marks || []) { const q = polar(m.alt, m.az, cx, cy, R); ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill(); const ox = q.x < cx ? -26 : 26; ctx.fillStyle = C.ink; ctx.fillText(`${m.hour}`, q.x + ox, q.y - 2); }
  if (w.sun) { const q = polar(Math.max(0, w.sun.alt), w.sun.az, cx, cy, R); ctx.beginPath(); ctx.arc(q.x, q.y, 20, 0, Math.PI * 2); ctx.fillStyle = w.sun.alt > 0 ? '#f6b21a' : '#aab2ae'; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke(); }
  ctx.fillStyle = C.ink; ctx.font = `700 30px ${FONT}`; ctx.fillText(w.label, cx, cy + R + 56);
  ctx.font = `400 17px ${FONT}`; ctx.fillStyle = C.mute; ctx.fillText('dashed: 21 Jun (amber) · 21 Dec (blue) · solid: chosen day', cx, cy + R + 84);
  ctx.restore(); ctx.textAlign = 'left';
}
function drawSlider(ctx, w) {
  const n = w.ids.length, step = w.w / (n - 1), ty = w.y + 14, kx = w.x + w.index * step, off = w.disabled;
  ctx.lineCap = 'round'; ctx.strokeStyle = off ? 'rgba(22,38,29,.18)' : 'rgba(22,38,29,.30)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(w.x, ty); ctx.lineTo(w.x + w.w, ty); ctx.stroke();
  ctx.strokeStyle = off ? C.grey : C.accent; ctx.beginPath(); ctx.moveTo(w.x, ty); ctx.lineTo(kx, ty); ctx.stroke();
  w.labels.forEach((l, i) => { const x = w.x + i * step, on = i === w.index;
    ctx.fillStyle = i <= w.index ? (off ? C.grey : C.accent) : 'rgba(22,38,29,.45)'; ctx.beginPath(); ctx.arc(x, ty, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = on ? C.ink : C.mute; ctx.font = `${on ? 700 : 400} 20px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(on ? `${l} people` : l, x, w.y + 48); });
  ctx.textAlign = 'left'; ctx.beginPath(); ctx.arc(kx, ty, 13, 0, Math.PI * 2); ctx.fillStyle = off ? C.grey : C.accent; ctx.fill(); ctx.strokeStyle = C.white; ctx.lineWidth = 3; ctx.stroke();
}

function drawYear(ctx, w) {
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w.x, w.y + w.h / 2); ctx.lineTo(w.x + w.w, w.y + w.h / 2); ctx.stroke();
  for (const m of w.marks) { const x = w.x + m.frac * w.w; ctx.fillStyle = m.solstice ? C.warn : C.blue; ctx.fillRect(x - 2, w.y + 2, 4, w.h - 4); }
  const x = w.x + w.frac * w.w; ctx.beginPath(); ctx.arc(x, w.y + w.h / 2, 11, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill(); ctx.strokeStyle = C.white; ctx.lineWidth = 3; ctx.stroke();
}

function drawStory(ctx, w) {
  const col = w.kind === 'decision' ? C.accent : w.kind === 'goal' ? C.warn : w.kind === 'option' ? '#1a8fa8' : C.blue, th = Math.round(w.w * 120 / 192);
  rr(ctx, w.x, w.y, w.w, w.h, 8); ctx.fillStyle = C.glass2; ctx.fill(); ctx.strokeStyle = w.head ? C.accent : col; ctx.lineWidth = w.head ? 5 : 2; if (w.kind === 'branch') ctx.setLineDash([7, 5]); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); rr(ctx, w.x + 4, w.y + 4, w.w - 8, th - 4, 5); ctx.clip();
  if (w.img && w.img.complete && w.img.naturalWidth) ctx.drawImage(w.img, w.x + 4, w.y + 4, w.w - 8, th - 4); else { ctx.fillStyle = 'rgba(138,149,143,.25)'; ctx.fillRect(w.x + 4, w.y + 4, w.w - 8, th - 4); ctx.fillStyle = C.grey; ctx.font = `400 15px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('no picture', w.x + w.w / 2, w.y + th / 2 + 6); ctx.textAlign = 'left'; }
  ctx.restore();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(w.x + 16, w.y + 16, 7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = C.white; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = C.ink; ctx.font = `700 15px ${FONT}`; ctx.textBaseline = 'top'; ctx.fillText(w.title, w.x + 8, w.y + th + 4, w.w - 16);
  ctx.fillStyle = C.mute; ctx.font = `400 14px ${FONT}`; ctx.fillText(w.sub, w.x + 8, w.y + th + 24, w.w - 16);
  if (w.head) { ctx.fillStyle = C.accent; ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText('YOU ARE HERE', w.x + w.w - 8, w.y + 8); ctx.textAlign = 'left'; }
}
