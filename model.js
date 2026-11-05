export const pct = value => `${(value*100).toFixed(1)}%`;
export function summary(data, scenario, target) {
  const r=scenario.results;
  return {count:(scenario.beams||data.beams).length-scenario.removed_beam_ids.length, shade:r.shade_mean, clear:r.corridor_clear,
    intruders:r.corridor_intruders.length, shadePass:r.shade_mean>=target,
    text:`This configuration ${r.corridor_clear?'meets':'does not meet'} the passage requirement and ${r.shade_mean>=target?'meets':'falls short of'} the shade target.`};
}
// Right handed Z-up -> right handed Y-up: (x,y,z) -> (x,z,-y).
export const toWorld = ([x,y,z]) => [x,z,-y];
export function validate(data){
  if(data.units!=='m'||data.beams.length!==182) throw Error('Model units or beam count do not match');
  const ids=new Set(data.beams.map(b=>b.id));
  if(ids.size!==data.beams.length)throw Error('Duplicate beam id ID');
  for(const s of data.scenarios) {
    if(s.removed_beam_ids.some(id=>!ids.has(id)))throw Error('Unknown removed beam id ID');
    if(s.results.shade_per_hour.length!==data.sun.length)throw Error('Time series do not match');
    if(data.schema_version>=3){const p=s.structure_proxy;if(!p||!Array.isArray(p.floating_beam_ids)||!Array.isArray(p.under_supported_beam_ids))throw Error('Structure proxy is missing');const own=s.beams?new Set(s.beams.map(b=>b.id)):ids;if(p.floating_beam_ids.concat(p.under_supported_beam_ids).some(id=>!own.has(id)))throw Error('Structure proxy names an unknown beam');}
    if(data.schema_version>=2){const g=s.shade_grid;if(!g||g.cell_mean.length!==g.nx*g.ny||g.shade_per_hour.some(r=>r.length!==g.nx*g.ny))throw Error('Per-cell grid does not match');}
  }
  return true;
}

// Objective measure (Wingler-style): time spent looking at each scenario. Pure so it can be tested.
export function addDwell(dwell,id,ms){if(!id||!(ms>0))return dwell;dwell[id]=(dwell[id]||0)+ms;return dwell;}
export const PREFERENCE_SCALE=[1,2,3,4,5];

// Wingler-style visibility: share of tracked time a target is within a cone around the viewing direction.
export function inCone(eye,forward,target,halfAngleDeg=30){
  const d=[target[0]-eye[0],target[1]-eye[1],target[2]-eye[2]];const dl=Math.hypot(...d),fl=Math.hypot(...forward);
  if(!dl||!fl)return false;const cos=(d[0]*forward[0]+d[1]*forward[1]+d[2]*forward[2])/(dl*fl);
  return cos>=Math.cos(halfAngleDeg*Math.PI/180);
}
export function addView(view,id,inView,ms){if(!id||!(ms>0))return view;const v=view[id]||(view[id]={inViewMs:0,trackedMs:0});v.trackedMs+=ms;if(inView)v.inViewMs+=ms;return view;}
export const viewShare=v=>v&&v.trackedMs>0?v.inViewMs/v.trackedMs:null;

export const STRATEGY_LABEL={as_designed:'As designed',clear_passage:'Clear passage',remove_module:'Remove a module',param_variant:'Parameter option',system:'Structural system (illustrative)',orientation:'Turned (same stock)'};
// One row per recorded decision, so decisions taken on different strategy branches can be read side by side.
export function decisionRows(events,data){
  return events.filter(e=>e.action==='decision').map(e=>{
    const s=data.scenarios.find(x=>x.id===e.state.scenario);const p=s?.structure_proxy;
    return {id:e.id,branch:e.branch,scenario:e.state.scenario,strategy:STRATEGY_LABEL[s?.strategy]||'—',
      shade:s?.results.shade_mean??null,floating:p?p.floating_beam_ids.length:null,underSupported:p?p.under_supported_beam_ids.length:null,
      preference:e.preference??null,rationale:e.rationale||null};});
}

// Brief check of one scenario against the project brief carried in the data.
export function briefStatus(data,scenario){const b=data.brief,c=scenario.brief_check;if(!b||!c)return null;
  return {area:c.footprint_hull_m2,height:c.max_height_m,areaOk:c.footprint_hull_m2<=b.max_projected_area_m2,heightOk:c.max_height_m<=b.max_height_m,ok:c.footprint_hull_m2<=b.max_projected_area_m2&&c.max_height_m<=b.max_height_m};}
export const OPTION_TITLE={opt_member_swap:'Option · one member replaced (D5, 120 × 140 mm)',opt_local_raise:'Option · roof raised 0.4 m over the seats',opt_low:'Option · 15% lower',opt_high:'Option · 5% higher',opt_wide:'Option · 10% wider in plan',opt_rot45:'Turned 45° (same stock)',opt_rot90:'Turned 90° (same stock)',opt_rot135:'Turned 135° (same stock)',opt_raise20:'Raised 20% · plan shrunk to fit the stock',opt_raise20_free:'Raised 20% · plan unchanged',sys_arch:'System · arches and purlins (illustrative)',sys_portal:'System · portal frames and slats (illustrative)'};

// Usage options: how many people the seating zone is for (assumption: the brief gives no head count). Swaps the zone, the shade results and the cell grid.
export function applyUsage(data,uid){const u=(data.usage_options||[]).find(x=>x.id===uid);if(!u)return false;
  for(const s of data.scenarios){if(!s._base)s._base={results:s.results,shade_grid:s.shade_grid};const v=s.usage?.[uid];if(!v)continue;
    s.results={...s._base.results,shade_mean:v.shade_mean,shade_min:v.shade_min,shade_per_hour:v.shade_per_hour};s.zone_grid=v.shade_grid;s.shade_grid=s.ground_grid||v.shade_grid;}   // the map and the selection cover the whole ground (schema 7); the zone numbers stay in results and usage
  data.zones.seating={...data.zones.seating,...u.seat,persons:u.persons};data.usage_current=uid;return true;}

// ---- design intention: who uses it, what for, which goals matter and how much (RIBA stage 1 / Double Diamond front end) -----------------
export const GOALS=[{id:'stage',label:'Stage clear height ≥ 2.0 m (demo)'},{id:'cover',label:'Shaded area ≥ 30 m² (demo)'},{id:'shade',label:'Shade over the seating zone'},{id:'passage',label:'Passage kept clear'},{id:'area',label:'Projected area ≤ 40 m²'},{id:'height',label:'Height ≤ 3 m'},{id:'plants',label:'Keep existing plants'}];
export const ROLES=['core','constraint','ignore'];
// Users and uses come from the Hardleaf booklet (community garden association; rest, gatherings, workshops, tables). No head count is given there.
export const DEFAULT_INTENT={users:'Community garden association members',uses:'Rest, gatherings, workshops, tables',roles:{stage:'core',cover:'core',shade:'constraint',passage:'ignore',area:'constraint',height:'constraint',plants:'constraint'}};
export const nextRole=r=>ROLES[(ROLES.indexOf(r)+1)%ROLES.length];
// status of each goal for one scenario; plants are not computed, so they stay 'unknown' instead of being guessed.
export function stageStatus(data,scenario){const z=data.stage,c=scenario.stage_check,b=scenario.brief_check;if(!z||!c||!b)return null;
  return {headroom:c.headroom_m,required:z.required_clear_m,ok:c.ok,area:b.footprint_hull_m2,coverMin:z.cover_min_m2,coverOk:b.footprint_hull_m2>=z.cover_min_m2};}
export function goalStatuses(info,brief,stage){return GOALS.map(g=>({...g,status:g.id==='stage'?(stage?(stage.ok?'ok':'bad'):'unknown'):g.id==='cover'?(stage?(stage.coverOk?'ok':'bad'):'unknown'):g.id==='shade'?(info.shadePass?'ok':'bad'):g.id==='passage'?(info.clear?'ok':'bad'):g.id==='area'?(brief?(brief.areaOk?'ok':'bad'):'unknown'):g.id==='height'?(brief?(brief.heightOk?'ok':'bad'):'unknown'):'unknown'}));}
const SHORT={stage:'Stage height',cover:'Shaded area',shade:'Seat shade',passage:'Passage',area:'Area',height:'Height',plants:'Plants'};
// one line for the console: which of the author's CORE goals this configuration meets, named briefly
export function coreVerdict(roles,statuses){const core=statuses.filter(s=>roles[s.id]==='core');if(!core.length)return 'No core goal chosen: set one on the INTENT panel';
  const bad=core.filter(s=>s.status==='bad'),ok=core.filter(s=>s.status==='ok');
  return `Core goals: ${ok.length} of ${core.length} met`+(bad.length?` · not met: ${bad.map(s=>SHORT[s.id]||s.label).join(', ')}`:' ✔');}
export function intentVerdict(roles,statuses){const live=statuses.filter(s=>roles[s.id]!=='ignore');const core=live.filter(s=>roles[s.id]==='core'),con=live.filter(s=>roles[s.id]==='constraint');
  const n=(a,st)=>a.filter(s=>s.status===st).length;return {core:{ok:n(core,'ok'),bad:n(core,'bad'),total:core.length},constraint:{ok:n(con,'ok'),bad:n(con,'bad'),unknown:n(con,'unknown'),total:con.length}};}

// ---- a region drawn in 3D: rectangle of cells between two clicked cells -----------------------------------------------------------------
// cell index = i*ny + j (the order the script writes them). sunHours = (1 - shaded share) x number of sun hours analysed.
export function regionStats(grid,a,b){const ia=Math.floor(a/grid.ny),ja=a%grid.ny,ib=Math.floor(b/grid.ny),jb=b%grid.ny;
  const i0=Math.min(ia,ib),i1=Math.max(ia,ib),j0=Math.min(ja,jb),j1=Math.max(ja,jb);const vals=[];
  for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++)vals.push(grid.cell_mean[i*grid.ny+j]);
  const mean=vals.reduce((x,y)=>x+y,0)/vals.length,hours=grid.shade_per_hour.length;
  let radiation=null;if(grid.radiation_kwh_m2){const rv=[];for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++)rv.push(grid.radiation_kwh_m2[i*grid.ny+j]);radiation=rv.reduce((x,y)=>x+y,0)/rv.length;}
  return {i0,i1,j0,j1,n:vals.length,area:vals.length*grid.step*grid.step,mean,min:Math.min(...vals),max:Math.max(...vals),sunHours:(1-mean)*hours,radiation,openRadiation:grid.open_kwh_m2??null};}

// ---- comparing under the same conditions; where a strategy comes from; what has and has not been checked -----------------------------------
export const BASIS_LABEL={existing:'Source: the Hardleaf design (traceable)',['existing-practice']:'Source: Hardleaf itself turned for shade',['own-test']:'Source: own deletion test on the existing system',['own-parametric']:'Source: own parameter option (not another system)',['own-illustrative']:'Source: illustration (own; not a GKR design)'};
export function compareInfo(a,b){const ca=a.comparability,cb=b.comparability;if(!ca||!cb)return {sameStock:null,text:'Comparability: no data'};
  const same=ca.same_stock&&cb.same_stock;
  const f=ca.stock_fit;   // reuse: a member may be cut shorter than its piece, never longer
  const text=same?'Same stock as the reference ✔':f?(f.feasible?`Different members, but all can be cut from the stock (waste ${f.waste_m.toFixed(1)} m) ✔`:`✘ ${f.longer_needed} members need longer pieces than the stock has (short ${f.shortfall_m.toFixed(1)} m)`):`✘ Not the same stock: ${ca.timber_length_m.toFixed(0)} m / reference ${cb.timber_length_m.toFixed(0)} m`;
  return {sameStock:same,stockFits:f?f.feasible:null,text,vars:ca.variables_changed};}
export const basisLabel=s=>BASIS_LABEL[s.strategy_basis?.source]||'Source: not stated';
export function checkChips(s){const c=s.checks;if(!c)return [];const st=x=>!x.done?'todo':x.ok===false?'bad':'ok';
  return [['stock','Stock',st(c.stock)],['contact','Contact (proxy)',st(c.contact)],['joints','Joints',st(c.joints)],['structure','Structure',st(c.structure)],['shade','Light (own)',st(c.shade)]].map(([id,label,state])=>({id,label,state}));}
// Deficit against the shade target, cell by cell: whole-day shaded share of each cell minus the target. Overall near target but one area exposed shows up here.
export function deficitStats(grid,target){const below=[];grid.cell_mean.forEach((v,i)=>{if(v<target)below.push(i)});let worst=null;grid.cell_mean.forEach((v,i)=>{if(worst===null||v<grid.cell_mean[worst])worst=i});
  return {n:grid.cell_mean.length,below:below.length,worst,worstMean:grid.cell_mean[worst],mean:grid.cell_mean.reduce((a,b)=>a+b,0)/grid.cell_mean.length};}

// Block-level residual exposure: cells below the target that touch each other (4-neighbours) form one block. The architect sees where, how big and how exposed.
export function exposedClusters(grid,target){const {nx,ny,cell_mean:cm,step}=grid;const seen=new Array(cm.length).fill(false),out=[];
  for(let k=0;k<cm.length;k++){if(seen[k]||cm[k]>=target)continue;const q=[k],cells=[];seen[k]=true;
    while(q.length){const c=q.pop();cells.push(c);const i=Math.floor(c/ny),j=c%ny;for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=i+di,b=j+dj;if(a<0||b<0||a>=nx||b>=ny)continue;const n=a*ny+b;if(!seen[n]&&cm[n]<target){seen[n]=true;q.push(n);}}}
    const is=cells.map(c=>Math.floor(c/ny)),js=cells.map(c=>c%ny);
    out.push({n:cells.length,area:cells.length*step*step,mean:cells.reduce((s,c)=>s+cm[c],0)/cells.length,i0:Math.min(...is),i1:Math.max(...is),j0:Math.min(...js),j1:Math.max(...js),cells});}
  return out.sort((a,b)=>b.n-a.n||a.mean-b.mean);}

// ---- actions that depend on what is selected: a timber member, or ground (a cell or a region) --------------------------------------------
// caps: {bridge: live answers available, canRemove: the current configuration is a member list that can be changed, canStand, standing}
export function contextActions(sel, caps = {}) {
  if (!sel) return null;
  if (sel.kind === 'beam') return {
    title: `Member ${sel.id}`, sub: `module ${sel.module} · ${(sel.length * 1000).toFixed(0)} mm`,
    actions: [
      { id: 'remove', label: 'Remove and test', enabled: !!(caps.bridge && caps.canRemove), note: caps.bridge ? (caps.canRemove ? 'light and contact, own script' : 'this configuration has its own member list') : 'needs the bridge' },
      { id: 'force', label: 'Force analysis', enabled: false, note: 'needs Karamba (off)' },
      { id: 'notchfit', label: 'Notch fit on a new piece (demo)', enabled: !!caps.hasJoints, note: 'position fit only, not a joint check' },
      { id: 'origin', label: 'Where it came from', enabled: !!caps.hasJoints, note: caps.hasJoints ? 'joints from the GKR model' : 'joint data not loaded' },
      { id: 'close', label: 'Close', enabled: true, note: '' }] };
  if (sel.kind === 'group') return {
    title: `${sel.ids.length} members`, sub: sel.sub || '',
    actions: [
      { id: 'remove', label: 'Remove all and test', enabled: !!(caps.bridge && caps.canRemove), note: caps.bridge ? (caps.canRemove ? 'light and contact, own script' : 'this configuration has its own member list') : 'needs the bridge' },
      { id: 'force', label: 'Force analysis', enabled: false, note: 'needs Karamba (off)' },
      { id: 'close', label: 'Close', enabled: true, note: '' }] };
  const region = sel.kind === 'region';
  return {
    title: region ? 'Region' : 'Ground cell', sub: sel.sub || '',
    actions: [
      { id: 'stand', label: caps.standing ? 'Back to model' : 'Stand here', enabled: !!(caps.canStand || caps.standing), note: 'eye height, same time' },
      ...(region ? [{ id: 'regiontime', label: caps.regionHour == null ? 'Own time for this region' : `Region time ${String(caps.regionHour).padStart(2, '0')}:00`, enabled: !!caps.canRegionTime, note: caps.canRegionTime ? 'cycles 9 · 12 · 15 · 18 · site time' : 'other dates need the bridge' },
        { id: 'members', label: 'Select members above', enabled: !!caps.canSelectMembers, note: 'everything over this footprint' }] : []),
      { id: 'close', label: 'Close', enabled: true, note: '' }] };
}
export function removeSummary(before, after, contact) {
  const pct = v => `${Math.round(v * 100)}%`, lines = [`Shade in the seating zone: ${pct(before)} → ${pct(after)}`];
  if (contact && !contact.error) lines.push(`Contact check: ${contact.floating.length} floating, ${contact.under_supported.length} under-supported`);
  lines.push('FAST · own script · geometric only, not structural');
  return lines;
}

// provenance of one member: its real joints (COMPAS Timber, GKR model). Re-notching a new piece is not computed anywhere.
const JOINT_LABEL = { TButtJoint: 'T-butt', PreferredFaceTButtJoint: 'T-butt (preferred face)', XLapJoint: 'cross lap', LMiterJoint: 'L-miter' };
export function provenanceLines(list, max = 4) {
  if (!list || !list.length) return ['No joints recorded for this member'];
  const n = {}; for (const j of list) n[JOINT_LABEL[j.type] || j.type] = (n[JOINT_LABEL[j.type] || j.type] || 0) + 1;
  const head = `${list.length} joints: ${Object.entries(n).map(([k, v]) => `${v} ${k}`).join(', ')}`;
  const rows = list.slice(0, max).map(j => `${Math.round(j.t * 100)}% along · ${JOINT_LABEL[j.type] || j.type} · with ${j.with}${j.role === 'main' ? ' (this one butts)' : j.role === 'cross' ? ' (received)' : ''}`);
  if (list.length > max) rows.push(`… and ${list.length - max} more`);
  return [head, ...rows, 'Re-notching a new piece: not computed'];
}

// ---- a range over the ground: share of its cells in shade at one moment, the members standing over it, and a position-only fit demo ----------------
export function regionShareAt(row, grid, r) {
  let n = 0, s = 0; for (let i = r.i0; i <= r.i1; i++) for (let j = r.j0; j <= r.j1; j++) { n++; if (row[i * grid.ny + j]) s++; } return n ? s / n : 0;
}
// beams: model coordinates (z up); box: {x0,x1,y0,y1} in model coordinates. A member counts when its middle lies over the footprint.
export function membersInFootprint(beams, box) {
  return beams.filter(b => { const f = b.frame, c = [f.point[0] + f.xaxis[0] * b.length / 2, f.point[1] + f.xaxis[1] * b.length / 2];
    return c[0] >= box.x0 && c[0] <= box.x1 && c[1] >= box.y0 && c[1] <= box.y1; });
}
export function groupSummary(list) {
  const len = list.reduce((s, b) => s + b.length, 0), mod = {}; for (const b of list) mod[b.module] = (mod[b.module] || 0) + 1;
  return `${len.toFixed(1)} m of timber · modules ${Object.entries(mod).sort().map(([k, v]) => `${k}${v}`).join(' ')}`;
}
// DEMO: do the notch positions of this member, measured from its start, lie within a new piece of another length? Position only; it says nothing about the joint itself.
export function notchFit(list, oldLength, factor) {
  const newL = oldLength * factor, pos = list.map(j => j.t * oldLength), fit = pos.filter(p => p <= newL + 1e-9).length;
  return [`DEMO · new piece ${newL.toFixed(2)} m (×${factor}): ${fit} of ${pos.length} notch positions lie on it`, 'Position only: not a joint check, not computed for real'];
}
