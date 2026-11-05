// Comparison facts in model coordinates (metres). No inferred structural results.
export const COMPARE_COLORS = {current:'#c06d32',reference:'#4483a0',gain:'#278975',loss:'#d59149',neutral:'#c5cdc6'};
export function members(data, s) {
  const removed = new Set(s.removed_beam_ids || []);
  return (s.beams || data.beams).filter(b => !removed.has(b.id));
}
export function endpoints(b) {
  return [b.frame.point, b.frame.point.map((p,i) => p + b.frame.xaxis[i]*b.length)];
}
export function hull(points) {
  const p = [...new Map(points.map(p=>[`${p[0]},${p[1]}`,p.slice(0,2)])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(p.length<3)return p;
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half=ps=>{const q=[];for(const v of ps){while(q.length>1&&cross(q.at(-2),q.at(-1),v)<=0)q.pop();q.push(v);}return q.slice(0,-1);};
  return [...half(p),...half([...p].reverse())];
}
export function geometryFacts(data,s) {
  const bs=members(data,s), pts=bs.flatMap(endpoints), outline=hull(pts);
  const polygonArea=Math.abs(outline.reduce((v,p,i)=>{const q=outline[(i+1)%outline.length];return v+p[0]*q[1]-q[0]*p[1];},0))/2;
  return {members:bs,outline,count:bs.length,length:bs.reduce((v,b)=>v+b.length,0),volume:bs.reduce((v,b)=>v+b.length*b.width*b.height,0),
    area:s.brief_check?.footprint_hull_m2??polygonArea,height:s.brief_check?.max_height_m??Math.max(...pts.map(p=>p[2])),
    minX:Math.min(...pts.map(p=>p[0])),maxX:Math.max(...pts.map(p=>p[0])),minY:Math.min(...pts.map(p=>p[1])),maxY:Math.max(...pts.map(p=>p[1]))};
}
const near=(a,b,t=.001)=>Math.abs(a-b)<t;
export function memberChanges(data,a,b) {
  const A=new Map(members(data,a).map(b=>[b.id,b])),B=new Map(members(data,b).map(b=>[b.id,b]));
  const added=[],removed=[],moved=[],resized=[],same=[];
  for(const [id,x] of A){const y=B.get(id);if(!y){added.push(id);continue;}
    const size=['length','width','height'].some(k=>!near(x[k],y[k]));
    // Frame directions matter even when both members have the same midpoint.
    const move=['point','xaxis','yaxis'].some(k=>x.frame[k].some((v,i)=>!near(v,y.frame[k][i])));
    if(size)resized.push(id);if(move)moved.push(id);if(!size&&!move)same.push(id);
  }
  for(const id of B.keys())if(!A.has(id))removed.push(id);
  return {added,removed,moved,resized,same,changed:[...new Set([...added,...removed,...moved,...resized])]};
}
// Align by ground position, never by array index. Missing or mismatched cells remain unknown.
export function shadeDifference(a,b,valuesA,valuesB,region=null) {
  if(!a||!b||!valuesA||!valuesB||!near(a.step,b.step,.00001))return {tiles:[],a:null,b:null,gain:0,loss:0};
  const key=(x,y)=>`${x.toFixed(4)},${y.toFixed(4)}`;
  const num=v=>typeof v==='boolean'?Number(v):v;
  const lookup=new Map(valuesB.map((v,k)=>[key(b.x0+(Math.floor(k/b.ny)+.5)*b.step,b.y0+(k%b.ny+.5)*b.step),v]));
  const tiles=[];
  valuesA.forEach((v,k)=>{const i=Math.floor(k/a.ny),j=k%a.ny,x=a.x0+(i+.5)*a.step,y=a.y0+(j+.5)*a.step;
    if(region&&(x<region.x0||x>region.x1||y<region.y0||y>region.y1))return;
    const av=num(v),ref=num(lookup.get(key(x,y)));if(!Number.isFinite(av)||!Number.isFinite(ref))return;
    tiles.push({x,y,a:av,b:ref,delta:av-ref,step:a.step});});
  return {tiles,a:tiles.length?tiles.reduce((s,t)=>s+t.a,0)/tiles.length:null,b:tiles.length?tiles.reduce((s,t)=>s+t.b,0)/tiles.length:null,
    gain:tiles.filter(t=>t.delta>.001).length,loss:tiles.filter(t=>t.delta<-.001).length};
}
export const signed=(n,d=1)=>Math.abs(n)<.5*10**-d?(0).toFixed(d):`${n>0?'+':'−'}${Math.abs(n).toFixed(d)}`;
// Historical deletion experiments remain in the data, outside the active design choices.
export const activeOption=s=>!(s.removed_beam_ids?.length)&&s.strategy!=='clear_passage';
export function stockStatus(s){
  const fit=s.comparability?.stock_fit;
  if(!fit)return {fits:null,text:'Stock length fit unknown'};
  return {fits:fit.feasible,text:fit.feasible?'Fits original stock lengths':`${fit.longer_needed} members exceed original stock · short ${fit.shortfall_m.toFixed(1)} m`};
}
export function compareFacts(data,a,b,{valuesA=a.shade_grid?.cell_mean,valuesB=b.shade_grid?.cell_mean,region=null,zone=null,tileBox=null}={}) {
  const A=geometryFacts(data,a),B=geometryFacts(data,b),changes=memberChanges(data,a,b),shade=shadeDifference(a.shade_grid,b.shade_grid,valuesA,valuesB,region);
  const ground={a:shade.a,b:shade.b};let shownTiles=shade;if(tileBox){const tiles=shade.tiles.filter(t=>t.x>=tileBox.x0&&t.x<=tileBox.x1&&t.y>=tileBox.y0&&t.y<=tileBox.y1);shownTiles={...shade,tiles,gain:tiles.filter(t=>t.delta>.001).length,loss:tiles.filter(t=>t.delta<-.001).length};}
  const shown=zone&&zone.a!==null&&zone.b!==null?zone:shade,scope=zone?.label||(region?'the selected region':'the same ground zone');
  const delta={area:A.area-B.area,height:A.height-B.height,length:A.length-B.length,volume:A.volume-B.volume,count:A.count-B.count,shade:shown.a===null||shown.b===null?null:shown.a-shown.b};
  // Quantity equality is explicitly different from using the same pieces.
  const byId=new Map(B.members.map(b=>[b.id,b]));
  const samePieces=A.count===B.count&&A.members.every(a=>{const b=byId.get(a.id);return b&&['length','width','height'].every(k=>near(a[k],b[k]));});
  const sameTotal=near(A.length,B.length,.01);
  const scores=[['shade',delta.shade===null?0:Math.abs(delta.shade)/.1],['area',Math.abs(delta.area)/Math.max(B.area,.1)],['height',Math.abs(delta.height)/Math.max(B.height,.1)],['material',Math.abs(delta.volume)/Math.max(B.volume,.01)]];
  const primary=scores.sort((a,b)=>b[1]-a[1])[0];
  return {A,B,changes,shade:shownTiles,shown:{a:shown.a,b:shown.b},ground,scope,tileScope:tileBox?scope:null,delta,samePieces,sameTotal,stockA:stockStatus(a),stockB:stockStatus(b),primary:primary[1]<.001?'all':primary[0]};
}
export function explanation(f,focus='all') {
  const d=f.delta,metric=focus==='all'?f.primary:focus;
  if(!f.changes.changed.length)return {headline:'The same model is shown twice.',why:'Choose a different option to reveal what changes.',key:'all'};
  const shade=d.shade===null?'Light data unavailable for this date / time.':Math.abs(d.shade)<.0005?`Shade is unchanged in ${f.scope}.`:`${Math.abs(d.shade*100).toFixed(1)} points ${d.shade>=0?'more':'less'} shade ${f.scope==='the whole ground'?'on':'in'} ${f.scope}.`;
  const quantity=f.samePieces?'The same timber members are kept.':f.sameTotal?'Total timber length is kept; member dimensions change.':`${Math.abs(d.length).toFixed(1)} m ${d.length>=0?'more':'less'} timber is used.`;
  const material=`${quantity} A: ${f.stockA.text}.`;
  if(metric==='shade')return {headline:shade,why:`${material} Changed beam positions change which sun rays reach the ground.`,key:metric};
  if(metric==='area')return {headline:Math.abs(d.area)<.05?'Projected area is unchanged.':`${Math.abs(d.area).toFixed(1)} m² ${d.area>=0?'larger':'smaller'} projected envelope.`,why:`The coloured ground outlines follow the beam endpoints. ${material}`,key:metric};
  if(metric==='height')return {headline:Math.abs(d.height)<.005?'Top height is unchanged.':`${Math.abs(d.height).toFixed(2)} m ${d.height>=0?'higher':'lower'} at the top.`,why:`The two rulers share a ground datum. ${material}`,key:metric};
  if(metric==='material')return {headline:material,why:`Unrolled strips show actual total length at 1:1, 10 m per full row; ${signed(d.count,0)} members, ${signed(d.volume,2)} m³.`,key:metric};
  return {headline:`${f.changes.changed.length} members differ in position, size or presence.`,why:`${material} ${shade}`,key:'all'};
}
// What "only what changed" is showing, in words. Nearly every option changes nearly every member, so hiding members alone shows almost nothing.
export function differenceNote(f) {
  const ch = f.changes, total = ch.same.length + ch.changed.length, rigid = ch.changed.length && !ch.resized.length && !ch.added.length && !ch.removed.length;
  const members = !ch.changed.length ? 'No member changes.'
    : rigid ? `Every member moved as one frame; ${ch.resized.length} changed size.`
    : `${ch.changed.length} of ${total} members changed (1 mm tolerance); ${ch.same.length} unchanged, drawn faint.`;
  const ground = f.shade.a === null ? 'No light data for this date / time.' : `${f.tileScope?`In ${f.tileScope}`:'On the whole ground'}: ${f.shade.gain} cells gain shade (teal), ${f.shade.loss} lose it (amber); unchanged cells are hidden.`;
  return `${members} ${ground}`;
}
// Three levels of decision, each with its own question and its own numbers.
export const DECISION_TIERS={
  whole:{label:'Whole strategy',metrics:{area:true,shade:true,height:true,material:true},scope:'ground',onlyChanged:false},
  local:{label:'Local change',metrics:{area:false,shade:true,height:true,material:true},scope:'seat',onlyChanged:true},
  member:{label:'Single member',metrics:{area:false,shade:true,height:false,material:true},scope:'ground',onlyChanged:true},
};
export const tierOf=s=>s?.member_change?'member':s?.local_change?'local':'whole';
// The single-member reading: what it touches at the joints, and what it does to a single ground cell.
export function memberNote(f,perMember,ids){
  if(!ids?.length)return 'Click a member to focus on it. Everything else fades out.';
  const id=ids[0],a=f.A.members.find(m=>m.id===id),b=f.B.members.find(m=>m.id===id),mm=m=>`${Math.round(m.width*1000)} × ${Math.round(m.height*1000)} mm`;
  const size=a&&b&&(a.width!==b.width||a.height!==b.height)?`${mm(b)} → ${mm(a)}`:a?`${mm(a)}, ${a.length.toFixed(2)} m`:'not in this option';
  const list=perMember?.[id]||[],joints=list.length?`${list.length} joints touch it (with ${[...new Set(list.map(j=>j.with))].join(', ')}); re-notching them is not computed.`:'No joints recorded.';
  const tiles=f.shade.tiles.filter(t=>Math.abs(t.delta)>.001);
  let cell='No ground cell changes.';if(!f.changes.changed.includes(id))cell='This member is the same in both options; click it again to go back.';else if(tiles.length){const t=tiles.reduce((p,q)=>Math.abs(q.delta)>Math.abs(p.delta)?q:p);cell=`${tiles.length} ground cells change; the largest goes from ${Math.round(t.b*100)}% to ${Math.round(t.a*100)}% of the hours in shade.`;}
  return `Member ${id}: ${size}. ${joints} ${cell}`;
}
// The comparison as a table for a saved figure. Each shade row names its scope, so two correct numbers are not read as a contradiction.
export function comparisonRows(f,seat,tier='whole'){
  const pc=v=>v===null||v===undefined?'no data':`${(v*100).toFixed(0)}%`,pp=(a,b)=>a===null||a===undefined||b===null||b===undefined?'—':`${signed((a-b)*100)} pp`;
  const R={
    area:['Projected area',`${f.A.area.toFixed(1)} m²`,`${f.B.area.toFixed(1)} m²`,`${signed(f.A.area-f.B.area)} m²`],
    seat:['Shade, seating zone',pc(seat?.a),pc(seat?.b),pp(seat?.a,seat?.b)],
    ground:['Shade, whole ground',pc(f.ground.a),pc(f.ground.b),pp(f.ground.a,f.ground.b)],
    height:['Top height',`${f.A.height.toFixed(2)} m`,`${f.B.height.toFixed(2)} m`,`${signed(f.A.height-f.B.height,2)} m`],
    timber:['Timber length',`${f.A.length.toFixed(1)} m`,`${f.B.length.toFixed(1)} m`,`${signed(f.A.length-f.B.length)} m`],
    stock:['Fits the stock lengths',f.stockA.fits===null?'unknown':f.stockA.fits?'yes':'no',f.stockB.fits===null?'unknown':f.stockB.fits?'yes':'no',''],
    members:['Members changed (1 mm tolerance)',`${f.changes.changed.length} of ${f.changes.changed.length+f.changes.same.length}`,'',''],
  };
  const order={whole:['area','ground','seat','height','timber','stock','members'],local:['seat','ground','height','timber','stock','members'],member:['members','seat','ground','timber','stock']}[tier]||[];
  return order.map(k=>R[k]);
}
