import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {VRButton} from 'three/addons/webxr/VRButton.js';
import {coreVerdict,stageStatus,contextActions,removeSummary,provenanceLines,regionShareAt,membersInFootprint,groupSummary,notchFit,summary,pct,toWorld,validate,addDwell,inCone,addView,viewShare,decisionRows,STRATEGY_LABEL,briefStatus,OPTION_TITLE,applyUsage,GOALS,DEFAULT_INTENT,nextRole,goalStatuses,regionStats,compareInfo,basisLabel,checkChips,deficitStats,exposedClusters} from './model.js';
import {DecisionHistory} from './history.js';
import {compareFacts,explanation,geometryFacts,COMPARE_COLORS,signed,activeOption,differenceNote,shadeDifference,memberNote,tierOf,DECISION_TIERS,comparisonRows} from './compare.js';
import {SpatialComparison} from './spatial.js';
import {stickOf,moveStep,turnStep,buttonEdges,BTN,yawOf} from './locomotion.js';
import {placementOffset} from './placement.js';
import {Bridge,shadeRequest} from './bridge.js';
import {sunPos,dayArc,dayOfYear,dateFromFraction,nearestHourOnArc,DATES} from './sun.js';
import {FLOW_STEPS,flowSVG,treeSVG,stripItems,stripCardHTML} from './flow.js';
import {PROVIDERS,askProvider} from './ai.js';
import {buildLocalScenario,localMapSVG,rowId} from './localsearch.js';
import {storyLayout,SIZES,fmtTime,W,H,PANEL_M,placePanels,needsReplace,easeToward,branchLayout,buildScreens,hitWidget,drawScreen} from './vrui.js';

const $=id=>document.getElementById(id);
const gridRect=gr=>({x_min:gr.x0,x_max:gr.x0+gr.nx*gr.step,y_min:gr.y0,y_max:gr.y0+gr.ny*gr.step});   // the rectangle a cell grid covers (the live bridge must compute the same cells)
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
const viewWidth=()=>innerWidth;
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(viewWidth(),innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.xr.enabled=true;
renderer.localClippingEnabled=true;
$('viewport').append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e9ece4');scene.fog=new THREE.Fog('#e9ece4',80,200);
const desktopBackground=scene.background,desktopFog=scene.fog;
const modelRoot=new THREE.Group();modelRoot.name='placed-model';scene.add(modelRoot);
const mr={active:false,placing:false,placed:false,ready:false,session:null,hitSource:null,pivot:new THREE.Vector3(),anchor:new THREE.Vector3(),yaw:0,initializedYaw:false,previousMode:null,error:''};
const placementRing=new THREE.Mesh(new THREE.RingGeometry(.16,.21,32),new THREE.MeshBasicMaterial({color:0xe0a000,side:THREE.DoubleSide,depthTest:false}));
placementRing.rotation.x=-Math.PI/2;placementRing.renderOrder=20;placementRing.visible=false;scene.add(placementRing);
const camera=new THREE.PerspectiveCamera(48,viewWidth()/innerHeight,.05,150);
const rig=new THREE.Group();scene.add(rig);rig.add(camera);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
function seatView(){const z=data.zones.seating,cx=(z.x_min+z.x_max)/2+(compareMode==='beside'?referenceOffset/2:0),cz=-(z.y_min+z.y_max)/2;if(renderer.xr.isPresenting)return;camera.position.set(cx,compareMode==='beside'?30:14,cz+.01);controls.target.set(cx,0,cz);controls.update();}
function home(){rig.position.set(0,0,0);if(data){fitComparison();return;}camera.position.set(13,10,15);controls.target.set(2,1,0);controls.update();}
home();
scene.add(new THREE.HemisphereLight(0xffffff,0x788273,2.3));
const sunLight=new THREE.DirectionalLight(0xfff1d4,3);sunLight.castShadow=true;sunLight.shadow.mapSize.set(2048,2048);
Object.assign(sunLight.shadow.camera,{left:-35,right:35,top:25,bottom:-25,near:.1,far:65});sunLight.shadow.bias=-.0005;scene.add(sunLight);scene.add(sunLight.target);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({color:0xdde3d4,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.015;ground.receiveShadow=true;scene.add(ground);
const groundGrid=new THREE.GridHelper(40,40,0xb0bca7,0xcdd5c5);scene.add(groundGrid);
var data;let current,reference,level=1,comparison=true,selected=null,showCells=true;
let compareMode='beside',compareFocus='all',localOverlap=false,ghostOpacity=.28,differencesOnly=false,shadeScope='seat',decisionTier='whole';const compareMetrics={area:true,shade:true,height:true,material:true};
let referenceOffset=13,comparisonFacts=null;
const assembly=new THREE.Group(),comparisonGroup=new THREE.Group();modelRoot.add(assembly,comparisonGroup);
const spatial=new SpatialComparison(modelRoot);
const picking=[];const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();
const palette={A:0xae7951,B:0xc38d5f,C:0x946d48,D:0xb68150,E:0xd2a475,F:0xa47e59,G:0xc19a6c,H:0x9b784d};
const history=new DecisionHistory(),stateLog=history.events;
let flowStep=1;const flowVisited=new Set([1]);
function snapshot(){return {step:flowStep,roles:{...intent.roles},usage,goalVersion,scenario:current?.id,reference:reference?.id,level,comparison,compareMode,compareFocus,localOverlap,ghostOpacity,differencesOnly,shadeScope,decisionTier,compareMetrics:{...compareMetrics},target:Number($('target').value),when:{...when},selectedBeam:selected?.userData.beam.id||null,inventoryRevision:'hardleaf-json-1606-final',structuralStatus:'not-rechecked'};}
function renderDecisionTable(){if(!data)return;const rows=decisionRows(stateLog,data);$('decisions').innerHTML=rows.length?'<tr><th>Record</th><th>branch</th><th>Strategy / configuration</th><th>shade</th><th>Floating / under-supported</th><th>preference</th></tr>'+rows.map(r=>`<tr><td>${r.id}</td><td>${r.branch}</td><td>${r.strategy}<br><small>${r.scenario}</small></td><td>${r.shade===null?'—':pct(r.shade)}</td><td>${r.floating} / ${r.underSupported}</td><td>${r.preference??'—'}</td></tr>`).join(''):'<tr><td>No decision recorded yet</td></tr>';}
function updateHistory(){renderDecisionTable();const old=$('historyState').value;$('historyState').replaceChildren();for(const e of stateLog)$('historyState').add(new Option(`${e.id} · ${e.branch} · ${e.action} · ${e.state.scenario}`,e.id));if(old)$('historyState').value=old;$('historySummary').textContent=`Current ${history.branch} / ${history.head}；${stateLog.length}  raw events`;
 renderFlow();try{localStorage.setItem(`hardleaf-history-${history.sessionId}`,JSON.stringify(history.export()));}catch{}}
function renderFlow(){if(!data||!$('flowChart'))return;const st=FLOW_STEPS[flowStep-1],f=comparisonFacts,persons=(data.usage_options||[]).find(u=>u.id===usage)?.persons,decided=stateLog.filter(e=>e.action==='decision').length,pc=v=>v===null||v===undefined?'—':`${(v*100).toFixed(0)}%`;
  const notes={1:`${persons} people`,'1b':`target ${$('target').value}%`,2:`${data.beams.length} members`,'2b':'cut shorter',3:{day:'whole day',hour:fmtTime(when.hour),radiation:'radiation'}[viewMode],'3b':`shade ${pc(f?.shown.a)}`,4:region?'region set':'no region','4b':selected?`member ${selected.userData.beam.id}`:'no member',5:title(current),6:`A ${pc(f?.shown.a)}`,'6b':`B ${pc(f?.shown.b)}`,7:`${decided} recorded`,'7b':`branch ${history.branch}`};
  $('panel').dataset.active=String(flowStep);$('flowChart').innerHTML=flowSVG(flowStep,[...flowVisited],notes);$('flowEyebrow').textContent=`Step ${flowStep} of ${FLOW_STEPS.length}`;$('flowTitle').textContent=st.name;$('flowAsk').textContent=st.ask;
  $('flowPrev').disabled=flowStep===1;$('flowNext').textContent=flowStep===FLOW_STEPS.length?'Return to intention':`Next: ${FLOW_STEPS[flowStep].name}`;
  renderHistoryStrip();}
let hsMode='strip',hsOpen=true;
function historyInfo(){const out={};for(const e of stateLog){const sc=data.scenarios.find(x=>x.id===e.state?.scenario),v=sc?.usage?.[e.state?.usage]?.shade_mean??sc?.results?.shade_mean,fit=sc?.comparability?.stock_fit;out[e.id]={thumb:e.thumb||null,line:[Number.isFinite(v)?`seat zone ${(v*100).toFixed(0)}%`:null,fit?(fit.feasible?'fits stock':'over stock'):null].filter(Boolean).join(' · ')};}return out;}
function renderHistoryStrip(){const box=$('hsBody');if(!box||!data)return;const story=storyLayout(stateLog,Object.fromEntries(data.scenarios.map(x=>[x.id,title(x)])),history.head,500),info=historyInfo(),n=story.nodes.length;
  $('hsCount').textContent=n?`${stateLog.filter(e=>e.action==='decision').length} recorded · ${story.lanes} branch${story.lanes>1?'es':''}`:'none yet';$('hsStrip').setAttribute('aria-pressed',String(hsMode==='strip'));$('hsTree').setAttribute('aria-pressed',String(hsMode==='tree'));$('hsHide').textContent=hsOpen?'Hide':'Show';$('hsHide').setAttribute('aria-expanded',String(hsOpen));$('historyStrip').classList.toggle('closed',!hsOpen);box.classList.toggle('tree',hsMode==='tree');
  const now=`<div class="hs-card now" title="The configuration in view. It joins the history when you record a decision."><span class="hs-noimg"></span><span class="hs-text"><b>Now: ${title(current).replace(/[<&]/g,'')}</b><small>not recorded yet</small></span></div><button type="button" class="hs-rec" id="hsRecord">Record…</button>`;
  if(hsMode==='tree'&&n)box.innerHTML=treeSVG(story,info);else{const items=stripItems(story);box.innerHTML=items.map((it,i)=>{const prev=items[i-1],fork=it.from&&prev&&it.from!==prev.id,link=i?`<span class="hs-link${fork?' fork':''}" title="${fork?`Branch from ${it.from}`:''}">${fork?'⤷':'→'}</span>`:'';return link+stripCardHTML(it,info[it.id]);}).join('')+(n?'<span class="hs-link">→</span>':'')+now;}
  box.scrollLeft=box.scrollWidth;document.documentElement.style.setProperty('--hist-h',`${$('historyStrip').offsetHeight}px`);}
function setFlowStep(n,quiet=false){const k=Math.max(1,Math.min(FLOW_STEPS.length,n));if(k===flowStep&&!quiet){renderFlow();return;}flowStep=k;flowVisited.add(k);if(quiet)renderFlow();else log('step',{step:k});}
const dwell={},viewTime={};let lastTick=Date.now(),lastFrame=performance.now();
const eyeV=new THREE.Vector3(),fwdV=new THREE.Vector3();
function trackView(){const now=performance.now(),dt=now-lastFrame;lastFrame=now;if(!data||!current||dt>250||document.hidden)return;
  const z=data.zones.seating,c=new THREE.Vector3(...toWorld([(z.x_min+z.x_max)/2,(z.y_min+z.y_max)/2,0]));
  camera.getWorldPosition(eyeV);camera.getWorldDirection(fwdV);
  addView(viewTime,current.id,inCone(eyeV.toArray(),fwdV.toArray(),c.toArray(),30),dt);}
function tick(){const n=Date.now();addDwell(dwell,current?.id,n-lastTick);lastTick=n;}
function log(action,details={}){history.append(action,snapshot(),details);updateHistory();}
function title(s){if(OPTION_TITLE[s.id])return OPTION_TITLE[s.id];if(s.id.startsWith('ls_'))return s.label;if(s.generated)return s.label.replace(/^generated: /,'Generated · ');return s.id==='all'?'Original Hardleaf · 182 beams':s.removed_beam_ids.length===66?'Passage cleared · geometry test':`Module ${s.label.match(/[A-H]$/)?.[0]||s.id} removed · geometry test`;}
function beamMesh(b,offset,scenario){
  const x=new THREE.Vector3(...toWorld(b.frame.xaxis)),y=new THREE.Vector3(...toWorld(b.frame.yaxis)),z=new THREE.Vector3().crossVectors(x,y).normalize();
  const origin=new THREE.Vector3(...toWorld(b.frame.point));
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(b.length,b.width,b.height),new THREE.MeshStandardMaterial({color:palette[b.module],roughness:.83}));
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
  mesh.position.copy(origin).addScaledVector(x,b.length/2);mesh.position.x+=offset;
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={beam:b,scenario};return mesh;
}
function clearGroup(g){g.traverse(m=>{m.geometry?.dispose();for(const v of [m.material].flat().filter(Boolean)){v.map?.dispose();v.dispose();}});g.clear();}
function labelTexture(lines,width=1100,height=560){const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.fillStyle='#f8fbf2';ctx.fillRect(0,0,width,height);ctx.fillStyle='#23432e';lines.forEach((line,i)=>{ctx.font=i===0?'bold 44px sans-serif':'30px sans-serif';ctx.fillText(line,40,65+i*58);});return new THREE.CanvasTexture(c);}
function zone(z,color,offset){const m=new THREE.Mesh(new THREE.PlaneGeometry(z.x_max-z.x_min,z.y_max-z.y_min),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.34,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.set((z.x_min+z.x_max)/2+offset,.015,-(z.y_min+z.y_max)/2);return m;}
const cellLayers=[];const SUN=new THREE.Color('#fbefd2'),SHADE=new THREE.Color('#1f5fa8');
// Each grid uses one coloured mesh and one invisible picking plane. Cell indices come from the hit coordinates.
// ---- light filter (author, 4 Nov): standing in the space between a ground cell and the roof tints the view like a filter on glasses, warm where the cell is sunlit, cool where it is shaded.
// No visible volume and no fog: multiply blending only colours the image, it does not wash it out. Follows the ground map's light mode (whole day / this hour / radiation).
const columnLayers=[];let showColumns=false;const FILTER_COOL=new THREE.Color(.62,.72,1),FILTER_WARM=new THREE.Color(1,.86,.58),FILTER_NONE=new THREE.Color(1,1,1);
function addColumns(g,s,offset){const gr=s.shade_grid;if(gr&&gr.roof_m)columnLayers.push({s,gr,offset});}
const lightVeil=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.MeshBasicMaterial({color:0xffffff,blending:THREE.MultiplyBlending,premultipliedAlpha:true,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));lightVeil.position.set(0,0,-.35);lightVeil.renderOrder=999;lightVeil.visible=false;camera.add(lightVeil);
const _hp2=new THREE.Vector3(),veilTarget=new THREE.Color(1,1,1);let veilInside=false;
// Desktop walking: W A S D or the arrow keys move the viewer on the ground plane; the orbit target moves too, so dragging still looks around.
const walkKeys=new Set(),_wf=new THREE.Vector3(),_wr=new THREE.Vector3(),_wd=new THREE.Vector3(),WALK_UP=new THREE.Vector3(0,1,0);
const WALK_MAP={KeyW:[1,0],ArrowUp:[1,0],KeyS:[-1,0],ArrowDown:[-1,0],KeyA:[0,-1],ArrowLeft:[0,-1],KeyD:[0,1],ArrowRight:[0,1]};
function updateWalk(dt){if(!walkKeys.size||renderer.xr.isPresenting)return;let f=0,r=0;for(const k of walkKeys){const m=WALK_MAP[k];if(m){f+=m[0];r+=m[1];}}if(!f&&!r)return;
  camera.getWorldDirection(_wf);_wf.y=0;if(_wf.lengthSq()<1e-6)_wf.subVectors(controls.target,camera.position).setY(0);if(_wf.lengthSq()<1e-6)_wf.set(0,0,-1);_wf.normalize();_wr.crossVectors(_wf,WALK_UP).normalize();
  const speed=Math.max(1.4,camera.position.y*.7)*(walkKeys.has('ShiftLeft')||walkKeys.has('ShiftRight')?2.5:1);_wd.copy(_wf).multiplyScalar(f).addScaledVector(_wr,r).normalize().multiplyScalar(speed*dt);camera.position.add(_wd);controls.target.add(_wd);controls.update();}
let walking=false;function setWalking(on){walking=on;document.body.classList.toggle('walking',on);$('walkIn').textContent=on?'Exit walk':'Walk in';}
function walkIn(){if(renderer.xr.isPresenting||!data)return;if(walking){setWalking(false);home();return;}const gr=current.shade_grid,x=gr.x0+17.5*gr.step,y=gr.y0+6.5*gr.step;camera.fov=75;camera.updateProjectionMatrix();camera.position.set(x,1.6,-y);controls.target.set(x,1.7,-y-1.5);controls.update();setWalking(true);if(!showColumns)toggleColumns();log('walk-in',{at:[x,1.6,-y]});}
function updateLightVeil(dt){veilInside=false;veilTarget.copy(FILTER_NONE);
  if(showColumns&&compareMode!=='overlay'){camera.getWorldPosition(_hp2);
    for(const {s,gr,offset} of columnLayers){const i=Math.floor((_hp2.x-offset-gr.x0)/gr.step),j=Math.floor((-_hp2.z-gr.y0)/gr.step);if(i<0||j<0||i>=gr.nx||j>=gr.ny)continue;const c=i*gr.ny+j,H=gr.roof_m[c];if(!(H>0.05&&_hp2.y<H))continue;
      let f;if(viewMode==='radiation')f=gr.radiation_kwh_m2?Math.min(1,gr.radiation_kwh_m2[c]/(gr.open_kwh_m2||1)):.5;else if(viewMode==='day')f=1-gr.cell_mean[c];else{const row=cellShade(s);f=row?(row[c]?0:1):.5;}
      veilTarget.copy(FILTER_COOL).lerp(FILTER_WARM,f);veilInside=true;break;}}
  const col=lightVeil.material.color;col.lerp(veilTarget,1-Math.exp(-dt/.35));lightVeil.visible=Math.abs(col.r-1)+Math.abs(col.g-1)+Math.abs(col.b-1)>.01;}
function toggleColumns(){showColumns=!showColumns;const b=$('columns');if(b)b.textContent=showColumns?'Light filter: on':'Light filter: off';log('light-filter',{on:showColumns});hintKey='';redrawVR();}
function addCells(g,s,offset){
  const gr=s.shade_grid;if(!gr)return;const w=gr.step,n=gr.nx*gr.ny,pos=new Float32Array(n*12),col=new Float32Array(n*12),idx=new Uint32Array(n*6);
  for(let i=0;i<gr.nx;i++)for(let j=0;j<gr.ny;j++){const c=i*gr.ny+j,x=gr.x0+(i+.5)*w+offset,z=-(gr.y0+(j+.5)*w),h=w*.47;
    pos.set([x-h,.03,z-h,x+h,.03,z-h,x+h,.03,z+h,x-h,.03,z+h],c*12);idx.set([c*4,c*4+2,c*4+1,c*4,c*4+3,c*4+2],c*6);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.setIndex(new THREE.BufferAttribute(idx,1));
  const layer=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.82,side:THREE.DoubleSide,depthWrite:false}));layer.frustumCulled=false;layer.userData={cellLayer:true};g.add(layer);
  const pick=new THREE.Mesh(new THREE.PlaneGeometry(gr.nx*w,gr.ny*w),new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));
  pick.visible=false;pick.rotation.x=-Math.PI/2;pick.position.set(gr.x0+gr.nx*w/2+offset,.025,-gr.y0-gr.ny*w/2);pick.userData={cellPick:true,cellLayer:layer,scenario:s,grid:gr,offset};
  g.add(pick);picking.push(pick);cellLayers.push({layer,pick,scenario:s,grid:gr,offset});
}
function cellFromHit(hit){const {grid:gr,scenario,offset}=hit.object.userData,w=gr.step,local=modelRoot.worldToLocal(hit.point.clone());
  const i=Math.floor((local.x-offset-gr.x0)/w),j=Math.floor((-local.z-gr.y0)/w);
  if(i<0||i>=gr.nx||j<0||j>=gr.ny)return null;
  const cell=i*gr.ny+j;
  return {userData:{grid:gr,scenario,offset,cell},getWorldPosition:target=>modelRoot.localToWorld(target.set(gr.x0+(i+.5)*w+offset,.03,-(gr.y0+(j+.5)*w)))};
}
function cellAtIndex(entry,cell){const {grid:gr,scenario,offset}=entry;if(cell<0||cell>=gr.nx*gr.ny)return null;
  const i=Math.floor(cell/gr.ny),j=cell%gr.ny;
  return {userData:{grid:gr,scenario,offset,cell},getWorldPosition:target=>modelRoot.localToWorld(target.set(gr.x0+(i+.5)*gr.step+offset,.03,-(gr.y0+(j+.5)*gr.step)))};
}
// a small picture of the scene for each decision: an off-screen camera and render target, so it also works inside a headset session
const thumbRT=new THREE.WebGLRenderTarget(192,120);thumbRT.texture.colorSpace=THREE.SRGBColorSpace;const thumbCam=new THREE.PerspectiveCamera(40,192/120,.1,200);thumbCam.position.set(12,8.5,13);thumbCam.lookAt(2.5,.8,0);
function captureThumb(){try{const xr=renderer.xr.enabled,keep=vrGroup.visible;thumbCam.position.copy(modelRoot.localToWorld(new THREE.Vector3(12,8.5,13)));thumbCam.lookAt(modelRoot.localToWorld(new THREE.Vector3(2.5,.8,0)));renderer.xr.enabled=false;vrGroup.visible=false;renderer.setRenderTarget(thumbRT);renderer.render(scene,thumbCam);renderer.setRenderTarget(null);renderer.xr.enabled=xr;vrGroup.visible=keep;
  const buf=new Uint8Array(192*120*4);renderer.readRenderTargetPixels(thumbRT,0,0,192,120,buf);const cv=document.createElement('canvas');cv.width=192;cv.height=120;const c=cv.getContext('2d'),id=c.createImageData(192,120);
  for(let y=0;y<120;y++)id.data.set(buf.subarray((119-y)*192*4,(120-y)*192*4),y*192*4);c.putImageData(id,0,0);return cv.toDataURL('image/jpeg',.72);}catch(e){return null;}}
const thumbImgs=new Map();function thumbOf(e){if(!e.thumb)return null;let im=thumbImgs.get(e.id);if(!im){im=new Image();im.onload=()=>redrawVR();im.src=e.thumb;thumbImgs.set(e.id,im);}return im;}
const wkey=()=>`${when.iso}|${when.hour}|${usage}`;
function precomputedRow(sc){const gr=sc.shade_grid;if(!gr||when.iso!=='2026-06-21')return -1;const i=data.sun.findIndex(x=>Math.abs(x.hour-when.hour)<1e-9);return i<0?-1:gr.hour_index.indexOf(i);}
function cellShade(sc){const c=liveCache.get(`${sc.id}|${wkey()}`);if(c)return c;const r=precomputedRow(sc);return r>=0?sc.shade_grid.shade_per_hour[r]:null;}
function requestLive(){if(!bridge.on||!data)return;for(const sc of [current,...(comparison?[reference]:[])]){const gr=sc.shade_grid,key=`${sc.id}|${wkey()}`;if(!gr||liveCache.has(key)||livePending.has(key))continue;livePending.add(key);
  bridge.shade(shadeRequest(sc,when,gridRect(gr),gr.step)).then(j=>{if(j.error||!j.shaded||j.shaded.length!==gr.nx*gr.ny)return;liveCache.set(key,j.shaded);liveMs=j.ms;recolor();refreshComparison();refresh3DInfo();redrawVR();}).finally(()=>livePending.delete(key));}}
function applySun(){const sp=sunPos(when.iso,when.hour);if(sp.altitude>0){sunLight.intensity=3;sunLight.position.copy(new THREE.Vector3(...toWorld(sp.dir)).multiplyScalar(25)).add(new THREE.Vector3(2,0,0));}else sunLight.intensity=0;sunLight.target.position.set(2,0,0);}
function setWhen(iso,hour){when={iso,hour:Math.round(hour*4)/4};if(iso==='2026-06-21'&&Number.isInteger(when.hour)){const i=data.sun.findIndex(x=>x.hour===when.hour);if(i>=0)$('hour').value=i;}log('time',{when:{...when}});requestLive();refresh();}
function sunState(){const sp=sunPos(when.iso,when.hour),arc=dayArc(when.iso),hoursUp={};for(const h of [6,9,12,15,18])hoursUp[h]=sunPos(when.iso,h).altitude>0;
  const marks=[6,9,12,15,18].filter(h=>hoursUp[h]).map(h=>{const p=sunPos(when.iso,h);return {hour:h,alt:p.altitude,az:p.azimuth};});const d=DATES.find(x=>x.iso===when.iso);
  return {iso:when.iso,hour:when.hour,arc,arcSummer:dayArc('2026-06-21'),arcWinter:dayArc('2026-12-21'),sun:{alt:sp.altitude,az:sp.azimuth},marks,hoursUp,frac:(dayOfYear(when.iso)-1)/364,yearMarks:DATES.map(x=>({frac:(dayOfYear(x.iso)-1)/364,solstice:x.note==='Solstice'})),
    label:`${d?d.label:when.iso} · ${fmtTime(when.hour)} · altitude ${Math.round(sp.altitude)}°`,live:{on:bridge.on,ms:liveMs??bridge.ms??0}};}
function recolor(){
  const target=Number($('target').value)/100,RED=new THREE.Color('#b3392f'),WHITE=new THREE.Color('#ffffff'),GREY=new THREE.Color('#bdbdbd'),cc=new THREE.Color();
  groundGrid.visible=viewMode!=='radiation';
  for(const {layer,grid:gr,scenario} of cellLayers){
    layer.visible=showCells&&compareMetrics.shade&&!differencesOnly&&['all','shade'].includes(compareFocus)&&compareMode!=='overlay';
    if(!layer.visible)continue;
    const att=layer.geometry.attributes.color,row=viewMode==='hour'?cellShade(scenario):null,sb=scopeBox(),OUT=new THREE.Color('#f6f6e8');
    for(let c=0;c<gr.nx*gr.ny;c++){
      if(viewMode==='day'){const v=gr.cell_mean[c];cc.copy(v>=target?WHITE:SUN).lerp(v>=target?SHADE:RED,v>=target?Math.min(1,(v-target)/Math.max(1e-6,1-target)):Math.min(1,(target-v)/Math.max(1e-6,target)));}
      else if(viewMode==='radiation'){const f=gr.radiation_kwh_m2?.[c],open=gr.open_kwh_m2;cc.copy(f==null||!open?GREY:SHADE).lerp(SUN,f==null||!open?0:Math.max(0,Math.min(1,f/open)));}
      else cc.copy(row?row[c]?SHADE:SUN:GREY);
      if(sb){const x=gr.x0+(Math.floor(c/gr.ny)+.5)*gr.step,y=gr.y0+(c%gr.ny+.5)*gr.step;if(x<sb.x0||x>sb.x1||y<sb.y0||y>sb.y1)cc.lerp(OUT,.85);}
      for(let k=0;k<4;k++)att.setXYZ(c*4+k,cc.r,cc.g,cc.b);
    }
    att.needsUpdate=true;
  }
}
function cellStats(s){const gr=s.shade_grid;if(!gr)return null;const row=cellShade(s),n=gr.nx*gr.ny,now=row?row.filter(Boolean).length:0,sunny=gr.cell_mean.filter(v=>v===0).length;return {n,now,sunny,known:!!row,worst:gr.worst_cell,step:gr.step};}
function toggleCells(){showCells=!showCells;$('cells').textContent=showCells?'Hide per-cell shade':'Show per-cell shade';log('cells');recolor();refresh3DInfo();redrawVR();}
function cycleLightMode(){viewMode={day:'hour',hour:'radiation',radiation:'day'}[viewMode];$('shadePeriod').textContent={day:'Whole day',hour:'This hour',radiation:'Direct radiation'}[viewMode];log('light-period');refresh();}
function build(){
  clearProv();ctxSel=null;placeCtx();clearGroup(assembly);clearGroup(comparisonGroup);pendingCell=null;region=null;regionDraft=null;if(draftGroup){modelRoot.remove(draftGroup);draftGroup=null;}$('regionBar')&&($('regionBar').hidden=true);if(regionOutline){modelRoot.remove(regionOutline);regionOutline=null;}picking.length=0;cellLayers.length=0;columnLayers.length=0;selected=null;
  const ca=geometryFacts(data,current),cb=geometryFacts(data,reference);referenceOffset=Math.max(13,ca.maxX-cb.minX+4);
  for(const [g,s,offset] of [[assembly,current,0],[comparisonGroup,reference,compareMode==='beside'?referenceOffset:0]]){
    if(g===comparisonGroup&&!comparison)continue;
    const removed=new Set(s.removed_beam_ids);
    const flagged=new Set(s.structure_proxy?[...s.structure_proxy.floating_beam_ids,...s.structure_proxy.under_supported_beam_ids]:[]);
    for(const b of (s.beams||data.beams)){if(removed.has(b.id))continue;const m=beamMesh(b,offset,s.id);m.userData.reference=g===comparisonGroup;if(flagged.has(b.id))m.userData.flag=true;g.add(m);if(g!==comparisonGroup)picking.push(m);}
    if(g===comparisonGroup&&compareMode==='overlay')continue;
    g.add(zone(data.zones.seating,0x6a9b77,offset));addCells(g,s,offset);addColumns(g,s,offset);

    if(data.stage){const st=data.stage,w=st.x_max-st.x_min,d=st.y_max-st.y_min;g.add(zone(st,0x7a5ad0,offset));   // the stage: its footprint and the volume it needs
      const box=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,st.required_clear_m,d)),new THREE.LineBasicMaterial({color:0x7a5ad0}));box.position.set((st.x_min+st.x_max)/2+offset,st.required_clear_m/2,-(st.y_min+st.y_max)/2);g.add(box);}

  }
  if(rackOn)for(const m of rackMeshes)if(!picking.includes(m))picking.push(m);
  if(mr.active){mr.pivot.copy(modelFloorPivot());if(mr.placed||mr.ready)placeModelAt(mr.anchor);}
  refresh();
}
function refresh(){
  if(!data)return;
  refreshComparison();requestLive();
  const target=Number($('target').value)/100,info=summary(data,current,target),ref=summary(data,reference,target);
  $('targetValue').textContent=pct(target);$('hourValue').textContent=fmtTime(when.hour);applySun();
  const metric=(name,a,b)=>`<div class="metric"><span>${name}</span><span>${a} / ${b}</span></div>`;
  const cs=cellStats(current),cr=cellStats(reference);
  if(level===1){const e=explanation(comparisonFacts,compareFocus);$('feedback').textContent=e.headline;}
  if(level===2){const f=comparisonFacts;$('feedback').innerHTML=metric('Projected area',`${f.A.area.toFixed(1)} m²`,`${f.B.area.toFixed(1)} m²`)+metric('Top height',`${f.A.height.toFixed(2)} m`,`${f.B.height.toFixed(2)} m`)+metric('Timber length',`${f.A.length.toFixed(1)} m`,`${f.B.length.toFixed(1)} m`)+metric('Original stock (length only)',f.stockA.text,f.stockB.text)+metric('Structural check',structText(current),structText(reference));}
  if(level===3){const e=explanation(comparisonFacts,compareFocus);$('feedback').replaceChildren();for(const t of [e.headline,e.why]){const p=document.createElement('p');p.textContent=t;$('feedback').append(p);}}
  $('status').textContent=`Loaded ${data.beams.length}  beams · ${data.scenarios.length}  preset configurations · ${stateLog.length}  recorded actions`;
  recolor();applyHighlights();refresh3DInfo();
  redrawVR();
}
function localBox(){
  if(region&&lastRegionGrid){const g=lastRegionGrid.gr;return {x0:g.x0+region.i0*g.step,x1:g.x0+(region.i1+1)*g.step,y0:g.y0+region.j0*g.step,y1:g.y0+(region.j1+1)*g.step};}
  const z=data.zones.seating;return {x0:z.x_min,x1:z.x_max,y0:z.y_min,y1:z.y_max};
}
function comparisonValues(s){return viewMode!=='hour'?(when.iso==='2026-06-21'?s.shade_grid?.cell_mean:null):cellShade(s);}
// The panel's shade figure is the seating zone, the number the design question is about. Precomputed zone results first (21 June); otherwise the live ground cells inside the zone.
function seatShare(s){const r=s.results;if(viewMode!=='hour')return when.iso==='2026-06-21'&&Number.isFinite(r?.shade_mean)?r.shade_mean:null;
  const i=when.iso==='2026-06-21'?data.sun.findIndex(x=>Math.abs(x.hour-when.hour)<1e-9):-1;if(i>=0&&Number.isFinite(r?.shade_per_hour?.[i]))return r.shade_per_hour[i];
  const gr=s.shade_grid,row=cellShade(s),z=data.zones.seating;if(!gr||!row)return null;let a=0,n=0;row.forEach((v,c)=>{const x=gr.x0+(Math.floor(c/gr.ny)+.5)*gr.step,y=gr.y0+(c%gr.ny+.5)*gr.step;if(x>=z.x_min&&x<=z.x_max&&y>=z.y_min&&y<=z.y_max){a+=Number(v);n++;}});return n?a/n:null;}
function seatZone(){const p=(data.usage_options||[]).find(u=>u.id===usage)?.persons;return {a:seatShare(current),b:seatShare(reference),label:p?`the seating zone for ${p} people`:'the seating zone'};}
function scopeBox(){if(shadeScope==='ground')return null;if(shadeScope==='region'&&region&&lastRegionGrid){const g=lastRegionGrid.gr;return {x0:g.x0+region.i0*g.step,x1:g.x0+(region.i1+1)*g.step,y0:g.y0+region.j0*g.step,y1:g.y0+(region.j1+1)*g.step};}const z=data.zones.seating;return {x0:z.x_min,x1:z.x_max,y0:z.y_min,y1:z.y_max};}
function scopeOptions(box){if(box)return {zone:null};const z=data.zones.seating,seat={x0:z.x_min,x1:z.x_max,y0:z.y_min,y1:z.y_max};
  if(shadeScope==='ground')return {zone:{a:null,b:null,label:'the whole ground'}};
  if(shadeScope==='region'&&region&&lastRegionGrid){const g=lastRegionGrid.gr,rb={x0:g.x0+region.i0*g.step,x1:g.x0+(region.i1+1)*g.step,y0:g.y0+region.j0*g.step,y1:g.y0+(region.j1+1)*g.step},d=shadeDifference(current.shade_grid,reference.shade_grid,comparisonValues(current),comparisonValues(reference),rb);return {zone:{a:d.a,b:d.b,label:'the selected region'},tileBox:rb};}
  return {zone:seatZone(),tileBox:seat};}
function syncDiffPick(){document.querySelectorAll('[data-focus]').forEach(b=>{const k=b.dataset.focus;if(k in compareMetrics)b.style.display=compareMetrics[k]?'':'none';});const r=$('scopeRegion');if(!r)return;if(shadeScope==='region'&&!region)shadeScope='seat';r.disabled=!region;$('scopeRegionText').textContent=region?`Selected region (${region.n} cells, ${region.area.toFixed(2)} m²)`:'Selected region (none yet)';const p=(data.usage_options||[]).find(u=>u.id===usage)?.persons;$('scopeSeat').textContent=p?`Seating zone (${p} people)`:'Seating zone';document.querySelectorAll('input[name="scope"]').forEach(i=>{i.checked=i.value===shadeScope;});}
function setDecisionTier(t,quiet=false){const d=DECISION_TIERS[t];if(!d)return;decisionTier=t;if(!quiet)lmHidden=false;Object.assign(compareMetrics,d.metrics);shadeScope=d.scope;differencesOnly=d.onlyChanged;if($('diffOnly'))$('diffOnly').checked=differencesOnly;document.querySelectorAll('[data-tier]').forEach(b=>b.classList.toggle('active',b.dataset.tier===t));document.querySelectorAll('[data-metric]').forEach(i=>{i.checked=compareMetrics[i.dataset.metric];});if(!quiet)log('decision-level',{tier:t});}
function focusMembers(){if(decisionTier!=='member'||!comparisonFacts)return null;const ch=comparisonFacts.changes.changed,ids=selected?[selected.userData.beam.id]:ch.length&&ch.length<=3?ch:[];return ids;}
function seatLine(){const a=seatShare(current),b=seatShare(reference);return a===null||b===null?'no data':`A ${(a*100).toFixed(0)}% / B ${(b*100).toFixed(0)}%`;}
// A comparison image from the current state: the 3D view as it stands, a table with both shade scopes, and what is assumed.
function comparisonFigure(){return new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const f=comparisonFacts,gl=renderer.domElement,W=1600,pad=28,imgW=880,imgH=Math.round(imgW*gl.height/gl.width),rows=comparisonRows(f,{a:seatShare(current),b:seatShare(reference)},decisionTier),H=Math.max(imgH+150,150+rows.length*46+260),c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const wrap=(t,px,py,mw,lh)=>{let line='',y=py;for(const w of String(t).split(' ')){const n=line?`${line} ${w}`:w;if(x.measureText(n).width>mw&&line){x.fillText(line,px,y);y+=lh;line=w;}else line=n;}if(line){x.fillText(line,px,y);y+=lh;}return y;};
  x.fillStyle='#fff';x.fillRect(0,0,W,H);x.fillStyle='#203329';x.font='bold 30px Arial';x.fillText(`${DECISION_TIERS[decisionTier].label}: ${title(current)}`,pad,48);x.font='20px Arial';x.fillStyle='#5d6c62';x.fillText(`A: ${title(current)}   against   B: ${title(reference)}`,pad,80);
  x.drawImage(gl,pad,104,imgW,imgH);const tx=pad+imgW+28,cols=[tx,tx+300,tx+400,tx+500];let y=128;x.font='bold 18px Arial';x.fillStyle='#203329';['','A','B','A − B'].forEach((t,i)=>x.fillText(t,cols[i],y));x.strokeStyle='#203329';x.beginPath();x.moveTo(tx,y+10);x.lineTo(W-pad,y+10);x.stroke();y+=42;
  for(const r of rows){x.font='18px Arial';x.fillStyle='#203329';x.fillText(r[0],cols[0],y);x.fillText(r[1],cols[1],y);x.fillText(r[2],cols[2],y);x.font='bold 18px Arial';x.fillText(r[3],cols[3],y);x.strokeStyle='#d9ded6';x.beginPath();x.moveTo(tx,y+14);x.lineTo(W-pad,y+14);x.stroke();y+=46;}
  x.font='17px Arial';x.fillStyle='#203329';y=wrap(decisionTier==='member'?memberNote(f,joints?.per_member,focusMembers()):differencesOnly?differenceNote(f):explanation(f,compareFocus).why,tx,y+6,W-pad-tx,24);
  x.font='15px Arial';x.fillStyle='#5d6c62';const persons=(data.usage_options||[]).find(u=>u.id===usage)?.persons;wrap(`${when.iso}, ${viewMode==='hour'?fmtTime(when.hour):'10–17 h mean'}. Seating zone: ${persons} people, assumed. Bare frame, simplified clear sky, direct light only. Geometry only: joints and structure are not checked.`,tx,y+12,W-pad-tx,20);
  log('save-comparison',{tier:decisionTier,a:current.id,b:reference.id});res(c.toDataURL('image/png'));})));}
async function saveComparisonFigure(){const url=await comparisonFigure(),a=document.createElement('a');a.href=url;a.download=`comparison_${decisionTier}_${current.id}_vs_${reference.id}.png`;a.click();}
function syncDock(){const d=$('comparisonDock');if(!d)return;const open=!d.classList.contains('collapsed');$('dockToggle').textContent=open?'Hide details ▾':'Details ▴';$('dockToggle').setAttribute('aria-expanded',String(open));if(comparisonFacts)$('dockSummary').textContent=explanation(comparisonFacts,compareFocus).headline;document.documentElement.style.setProperty('--dock-h',`${d.offsetHeight}px`);}
// ---- the local search map: shown at the local level, a click puts that option in the scene ----
let localSearch=null,lmHidden=false,lmSelected=null;
function renderLocalMap(){const box=$('localMapBox');if(!box)return;const show=!!localSearch&&decisionTier==='local'&&usage==='u4'&&!lmHidden;box.hidden=!show;if(!show)return;const fit=localSearch.rows.filter(r=>r.fits_stock).length;$('lmCount').textContent=`${localSearch.rows.length} tried · ${fit} fit · original ${(localSearch.original_seat_shade*100).toFixed(1)}%`;const sel=current?.id?.startsWith('ls_')?current.id:lmSelected;$('lmBody').innerHTML=localMapSVG(localSearch.rows,sel);}
function pickLocal(id){const row=localSearch?.rows.find(r=>rowId(r)===id);if(!row)return;const base=data.scenarios.find(s=>s.id==='all'),grid=base.ground_grid||base.shade_grid;lmSelected=id;addGenerated(buildLocalScenario(base.beams||data.beams,base,grid,row,localSearch));log('local-search-pick',{row:id,seat_shade:row.seat_shade,fits_stock:row.fits_stock});}
// ---- parameter check: the key stays in this browser; only the parameter list and the question leave it, to the chosen provider ----
const aiState={turns:[],busy:false};
function aiParams(){const f=comparisonFacts,p=(data.usage_options||[]).find(u=>u.id===usage),z=data.zones.seating,pc=v=>v===null||v===undefined?'no data':`${(v*100).toFixed(0)}%`;return [
  {name:'People in the seating zone',value:p?.persons??null,source:'assumed'},{name:'Seating zone size',value:`${(z.x_max-z.x_min).toFixed(1)} × ${(z.y_max-z.y_min).toFixed(1)} m`,source:'assumed, 1.5 m² each'},{name:'Shade target',value:`${$('target').value}%`,source:'placeholder'},
  {name:'Date and hours',value:`${when.iso}, 10–17 h`,source:'placeholder'},{name:'Site',value:'Zurich, latitude 47.37, longitude 8.54; north unknown',source:'placeholder'},
  {name:'Current option',value:title(current),source:'selected'},{name:'Reference option',value:title(reference),source:'selected'},{name:'Decision level',value:DECISION_TIERS[decisionTier].label,source:'selected'},
  {name:'Seat-zone shade',value:`A ${pc(seatShare(current))} / B ${pc(seatShare(reference))}`,source:'computed, 10 cm sampling, bare frame, direct light'},{name:'Whole-ground shade',value:f?`A ${pc(f.ground.a)} / B ${pc(f.ground.b)}`:'no data',source:'computed, 25 cm map'},
  {name:'Projected area',value:f?`${f.A.area.toFixed(1)} m²`:'no data',source:'computed; brief limit 40 m²'},{name:'Top height',value:f?`${f.A.height.toFixed(2)} m`:'no data',source:'computed; brief limit 3 m'},{name:'Timber length',value:f?`${f.A.length.toFixed(1)} m of ${f.B.length.toFixed(1)} m`:'no data',source:'computed'},
  {name:'Stock rule',value:'one piece per member; cut shorter, at most 10 mm longer',source:'author decision'},{name:'Stock result',value:f?f.stockA.text:'no data',source:'computed, lengths only'},
  {name:'Goal roles',value:intent.roles,source:'user'},{name:'Not modelled',value:'plants, weather, diffuse light, reflection, joints, structure, comfort, cost',source:'limits of the prototype'}];}
function aiStore(k,v){try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch{}}function aiRead(k){try{return localStorage.getItem(k);}catch{return null;}}
function aiMsg(cls,build){const d=document.createElement('div');d.className='ai-msg '+cls;build(d);$('aiLog').append(d);d.scrollIntoView({block:'nearest'});return d;}
function aiText(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
function aiSyncProvider(){const id=$('aiProvider').value,p=PROVIDERS[id];$('aiModel').value=aiRead(`hardleaf-ai-model-${id}`)||p.model;const saved=aiRead(`hardleaf-ai-key-${id}`);$('aiKey').value=saved||aiState[`key_${id}`]||'';$('aiRemember').checked=!!saved;$('aiKeyLink').href=p.keyUrl;aiSyncLabel();}
function aiSyncLabel(){const id=$('aiProvider').value;$('aiSettingsLabel').textContent=$('aiKey').value?`AI settings · ${PROVIDERS[id].label} · key set`:'AI settings · add your key first';if(!$('aiKey').value)$('aiSettings').open=true;}
function aiKeyChanged(){const id=$('aiProvider').value,k=$('aiKey').value.trim();aiState[`key_${id}`]=k;aiStore(`hardleaf-ai-key-${id}`,$('aiRemember').checked&&k?k:null);aiStore(`hardleaf-ai-model-${id}`,$('aiModel').value.trim()&&$('aiModel').value.trim()!==PROVIDERS[id].model?$('aiModel').value.trim():null);aiSyncLabel();}
function aiOpen(open){$('aiBox').classList.toggle('closed',!open);$('aiToggle').setAttribute('aria-expanded',String(open));if(open){aiSyncLabel();$('aiInput').focus();}}
async function aiAsk(){const q=$('aiInput').value.trim();if(!q||aiState.busy)return;const id=$('aiProvider').value,key=$('aiKey').value.trim();aiKeyChanged();if(!key){aiMsg('err',d=>d.textContent='Enter an API key in AI settings first.');$('aiSettings').open=true;return;}
  aiMsg('me',d=>d.textContent=q);$('aiInput').value='';aiState.busy=true;$('aiSend').disabled=true;const wait=aiMsg('',d=>d.textContent='Checking…');const params=aiParams();
  const r=await askProvider(id,{key,model:$('aiModel').value.trim(),params,requirement:q,history:aiState.turns.slice(-6)});wait.remove();aiState.busy=false;$('aiSend').disabled=false;
  if(!r.ok){aiMsg('err',d=>d.textContent=r.error);log('ai-check',{provider:id,question:q,error:r.error});return;}
  aiState.turns.push({role:'user',content:q},{role:'assistant',content:r.raw});
  aiMsg('',d=>{d.append(aiText('div',r.in_scope?r.summary:(r.summary||'This box only checks parameters.')));if(r.checks.length){d.append(aiText('b','Parameters'));for(const c of r.checks){const row=document.createElement('div');row.className='ai-row';row.append(aiText('span',c.status,'ai-st '+c.status),aiText('span',`${c.name}: ${c.note}`));d.append(row);}}if(r.newParams.length){d.append(aiText('b','May need a new parameter'));for(const n of r.newParams)d.append(aiText('div',`${n.name}: ${n.why}`,'ai-row'));d.append(aiText('small','A suggestion to consider. Nothing was added or changed.'));}else if(r.in_scope)d.append(aiText('small','No new parameter suggested.'));if(r.dropped)d.append(aiText('small',`${r.dropped} item(s) about parameters that do not exist were left out.`));});
  log('ai-check',{provider:id,model:$('aiModel').value.trim(),question:q,in_scope:r.in_scope,summary:r.summary,checks:r.checks,new_parameters:r.newParams});}
function setupAI(){const s=$('aiProvider');if(!s)return;for(const [id,p] of Object.entries(PROVIDERS))s.add(new Option(p.label,id));const last=aiRead('hardleaf-ai-provider');if(last&&PROVIDERS[last])s.value=last;aiSyncProvider();
  s.onchange=()=>{aiStore('hardleaf-ai-provider',s.value);aiSyncProvider();};$('aiKey').oninput=aiKeyChanged;$('aiModel').onchange=aiKeyChanged;$('aiRemember').onchange=aiKeyChanged;
  $('aiClear').onclick=()=>{const id=s.value;aiStore(`hardleaf-ai-key-${id}`,null);delete aiState[`key_${id}`];$('aiKey').value='';$('aiRemember').checked=false;aiSyncLabel();};
  $('aiToggle').onclick=()=>aiOpen($('aiBox').classList.contains('closed'));$('aiForm').onsubmit=e=>{e.preventDefault();aiAsk();};$('aiInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();aiAsk();}};
  $('intentToChat').onclick=()=>{$('panel').hidden=true;$('advancedToggle').setAttribute('aria-expanded','false');aiOpen(true);};}
function refreshComparison(){syncDiffPick();renderLocalMap();
  const box=compareMode==='overlay'&&localOverlap?localBox():null;
  comparisonFacts=compareFacts(data,current,reference,{valuesA:comparisonValues(current),valuesB:comparisonValues(reference),region:box,...scopeOptions(box)});
  const f=comparisonFacts,e=explanation(f,compareFocus),d=f.delta;
  const values={area:[`${f.A.area.toFixed(1)} m²`,`${f.B.area.toFixed(1)} m²`,`${signed(d.area)} m²`],
    height:[`${f.A.height.toFixed(2)} m`,`${f.B.height.toFixed(2)} m`,`${signed(d.height,2)} m`],
    shade:[f.shown.a===null?'No data':`${(f.shown.a*100).toFixed(0)}%`,f.shown.b===null?'No data':`${(f.shown.b*100).toFixed(0)}%`,d.shade===null?'Unavailable':`${signed(d.shade*100)} pp`],
    material:[`${f.A.length.toFixed(1)} m`,`${f.B.length.toFixed(1)} m`,`${signed(d.length)} m`]};
  for(const [k,v] of Object.entries(values)){const b=document.querySelector(`[data-focus="${k}"]`);if(b){b.querySelector('.delta').textContent=v[2];b.querySelector('.pair').textContent=`A ${v[0]} / B ${v[1]}`;b.classList.toggle('active',compareFocus===k);b.classList.toggle('major',f.primary===k);}}
  document.querySelectorAll('[data-compare-mode]').forEach(b=>{const on=b.dataset.compareMode===compareMode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  $('allFocus')?.classList.toggle('active',compareFocus==='all');
  if($('compareHeadline')){$('compareHeadline').textContent=e.headline;$('compareWhy').textContent=e.why;
    $('compareContext').textContent=`${viewMode!=='hour'?'21 Jun · 10–17 h mean':when.iso+' · '+fmtTime(when.hour)} · ${box?'selected region':`shade figure: ${f.scope.replace(/^the /,'')}`} · seat zone ${seatLine()} · whole ground, 25 cm map ${f.ground.a===null?'no data':`A ${(f.ground.a*100).toFixed(0)}% / B ${(f.ground.b*100).toFixed(0)}%`} · bare frame / direct light`;
    $('lightScale').style.display=viewMode==='radiation'?'block':'none';
    $('lightLegend').textContent=viewMode==='radiation'?(current.shade_grid?.open_kwh_m2?`Ground: blue 0 → pale ${current.shade_grid.open_kwh_m2.toFixed(2)} kWh/m² direct radiation (clear sky, 21 Jun; open ground maximum)`:'Ground: direct radiation unavailable for this configuration'):viewMode==='day'?'Ground: red below shade target · pale at target · blue above target (21 Jun)':'Ground: pale in sun · blue in shade · grey means no hourly result';
    $('stockIdentity').textContent=`A: ${f.stockA.text} · B: ${f.stockB.text} · length check, 10 mm tolerance`; $('stockIdentity').dataset.fits=String(f.stockA.fits);
    $('comparisonLegend').textContent=decisionTier==='member'?memberNote(f,joints?.per_member,focusMembers()):differencesOnly?differenceNote(f):viewMode!=='radiation'&&(compareFocus==='shade'||compareFocus==='all')?'Teal = more shade here · amber = less · outlined ground = projected envelope':'A orange = current · B blue = reference · outlined ground = projected envelope';
    $('localOverlap').checked=localOverlap;$('localOverlap').disabled=compareMode!=='overlay';$('ghostOpacity').disabled=compareMode!=='overlay';
    $('compare').textContent=compareMode==='single'?'Bring reference beside':'Hide reference';}
  spatial.update(f,{mode:compareMode,focus:compareFocus,offset:referenceOffset,local:localOverlap,localBox:box,titleA:title(current),titleB:title(reference),showShadeTiles:(viewMode!=='radiation'||differencesOnly)&&compareMetrics.shade,onlyChanged:differencesOnly,metrics:compareMetrics});
  paintComparison();renderFlow();syncDock();
}
function paintComparison(){if(!comparisonFacts)return;
  const changed=new Set(comparisonFacts.changes.changed),box=localBox();
  // Focus: the chosen member stays solid, the members it joins are half faded, everything else fades out.
  const fm=focusMembers();let focusIds=null;if(decisionTier==='member'&&fm?.length){const near=new Set();for(const id of fm)for(const j of joints?.per_member?.[id]||[])near.add(j.with);for(const id of fm)near.delete(id);focusIds={core:new Set(fm),near};}
  const planes=compareMode==='overlay'&&localOverlap?[
    new THREE.Plane(new THREE.Vector3(1,0,0),-box.x0),new THREE.Plane(new THREE.Vector3(-1,0,0),box.x1),
    new THREE.Plane(new THREE.Vector3(0,0,-1),-box.y0),new THREE.Plane(new THREE.Vector3(0,0,1),box.y1)]:[];
  for(const g of [assembly,comparisonGroup])for(const m of g.children){const b=m.userData.beam;if(!b)continue;
    const ref=m.userData.reference,isChanged=changed.has(b.id),ghost=ref&&compareMode==='overlay';
    m.visible=true;const fid=focusIds,isCore=fid?fid.core.has(b.id):isChanged,isNear=!!fid&&fid.near.has(b.id),faint=fid?!isCore&&!isNear:differencesOnly&&!isChanged;
    m.material.color.set(isChanged&&compareMetrics.material?(ref?COMPARE_COLORS.reference:COMPARE_COLORS.current):'#b6b8ae');
    m.material.transparent=ghost||['material','shade'].includes(compareFocus)||compareMode==='overlay';if(fid&&isCore)m.material.color.set(ref?COMPARE_COLORS.reference:COMPARE_COLORS.current);if(faint||isNear)m.material.transparent=true;m.material.opacity=faint?(fid?.06:.2):isNear?.55:differencesOnly&&!ghost?1:ghost?ghostOpacity:compareFocus==='material'?.28:compareFocus==='shade'?.36:compareMode==='overlay'?.8:1;
    m.material.depthWrite=!ghost&&!faint;m.material.depthTest=!ghost;m.renderOrder=ghost?3:0;m.castShadow=!ghost;m.material.clippingPlanes=ref?planes:[];m.material.needsUpdate=true;
  }
}
function fitComparison(){if(!data||renderer.xr.isPresenting)return;if(walking)setWalking(false);if(!previewVR&&camera.fov!==48){camera.fov=48;camera.updateProjectionMatrix();}
  const box=new THREE.Box3().setFromObject(assembly);if(comparison)box.union(new THREE.Box3().setFromObject(comparisonGroup));
  // Material strips and labels are part of the composition, too.
  if(compareFocus==='material')box.union(new THREE.Box3().setFromObject(spatial.group));
  const c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3());
  const fov=THREE.MathUtils.degToRad(camera.fov),visibleH=Math.max(4,s.y+s.z*.55),width=Math.max(8,s.x);
  const dist=Math.max(width/(2*Math.tan(fov/2)*camera.aspect),visibleH/(2*Math.tan(fov/2)))*(compareMode==='beside'?1.3:1.6);
  if(!new URLSearchParams(location.search).has('vr'))camera.setViewOffset(viewWidth(),innerHeight,0,innerHeight*.1,viewWidth(),innerHeight);
  controls.target.copy(c);camera.position.copy(c).add(new THREE.Vector3(0,.72,1).normalize().multiplyScalar(dist));controls.update();
}
function setCompareMode(mode){if(!['single','beside','overlay'].includes(mode))return;compareMode=mode;comparison=mode!=='single';log('comparison');build();fitComparison();}
function setCompareFocus(focus){if(!['all','area','height','shade','material'].includes(focus))return;compareFocus=focus;log('comparison-focus');refresh();if(focus==='material')fitComparison();}
function fillConditions(){const z=data.zones,st=data.site,f=n=>n.toFixed(2);
  const rows=[['Site',`Latitude ${st.latitude}°, longitude ${st.longitude}°`,st.assumption],['Date',`${st.date}, UTC${st.utc_offset>=0?'+':''}${st.utc_offset}`,st.assumption],
   ['Seating zone',`${f(z.seating.x_max-z.seating.x_min)} × ${f(z.seating.y_max-z.seating.y_min)} m`,z.seating.assumption],
   ['Shade requirement',`≥ ${pct(data.requirement.shade_min)}`,true],['Structure','not re-checked',true]];
  const br=data.brief;if(br){const c=br.model_check,ok=(v,max)=>v<=max?'✔':'✘';rows.push(['Brief · projected area',`${f(c.footprint_hull_m2)} m² ≤ ${br.max_projected_area_m2} ${ok(c.footprint_hull_m2,br.max_projected_area_m2)}`,false],['Brief · max height',`${f(c.max_height_m)} m ≤ ${br.max_height_m} ${ok(c.max_height_m,br.max_height_m)}`,false],['Brief · timber length',`${c.timber_length_m.toFixed(0)} m (brief about ${br.timber_length_m_approx} m)`,false]);}
  $('conditions').innerHTML=rows.map(([k,v,a])=>`<div class="metric"><span>${k}</span><span>${v}${a?' <em>assumed</em>':''}</span></div>`).join('')+'<small>Conditions marked assumed are placeholders in the script and need the author’s confirmation; changing them means rerunning the script.</small>';}
function textSprite(lines,w,h,scale){const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');c.fillStyle='rgba(248,251,242,.94)';c.fillRect(0,0,w,h);c.strokeStyle='#23432e';c.lineWidth=4;c.strokeRect(2,2,w-4,h-4);
  lines.forEach((l,i)=>{c.fillStyle=i?'#23432e':'#0f2a18';c.font=(i?'30px':'bold 36px')+' sans-serif';c.textBaseline='top';c.fillText(l,16,14+i*46);});
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),depthTest:false,transparent:true}));sp.scale.set(scale,scale*h/w,1);sp.renderOrder=10;return sp;}
const infoGroup=new THREE.Group();modelRoot.add(infoGroup);let regionSprite=null;
let pendingMarker=null;   // first corner of a region: a thick amber square and a post, so the user sees where the region starts
function setPendingMarker(cx,cz,w){clearPendingMarker();const h=w*.5,pts=[[cx-h,cz-h],[cx+h,cz-h],[cx+h,cz+h],[cx-h,cz+h]].map(([x,z])=>new THREE.Vector3(x,.08,z)),g=new THREE.Group();
  const sq=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xe0a000}));sq.renderOrder=12;g.add(sq);
  const post=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.9,8),new THREE.MeshBasicMaterial({color:0xe0a000}));post.position.set(cx,.45,cz);g.add(post);infoGroup.add(g);pendingMarker=g;}
function clearPendingMarker(){if(pendingMarker){infoGroup.remove(pendingMarker);pendingMarker=null;}}
function zoneOf(s){const gr=s.shade_grid;return gr?{gr,all:regionStats(gr,0,gr.nx*gr.ny-1)}:null;}
// 3D information next to the seating zone: colour bar legend lying on the ground, and the zone figures floating above it. No panel needed to read them.
function refresh3DInfo(){clearGroup(infoGroup);}
// first person: stand on the selected cell (or the middle of the selected region) at eye height and look at the model; the sun and hour stay as set
let standing=false,lastRegionGrid=null;
function standTarget(){const m=pendingCell?pendingCell.m:null,src=region&&regionOutline?regionOutline:null;
  if(region&&lastRegionGrid){const gr=lastRegionGrid.gr,off=lastRegionGrid.offset;return {x:gr.x0+((region.i0+region.i1+1)/2)*gr.step+off,z:-(gr.y0+((region.j0+region.j1+1)/2)*gr.step)};}
  if(m){const {grid:gr,cell,offset}=m.userData,i=Math.floor(cell/gr.ny),j=cell%gr.ny;return {x:gr.x0+(i+.5)*gr.step+offset,z:-(gr.y0+(j+.5)*gr.step)};}
  return null;}
function standHere(){const p=standTarget();if(!p||mr.active)return false;standing=true;
  if(renderer.xr.isPresenting){rig.position.set(p.x,rigY,p.z);}else{camera.position.set(p.x,1.6,p.z);controls.target.set(2.5,1.4,p.z-4);controls.update();}
  log('stand-here',{standAt:{x:+p.x.toFixed(2),z:+p.z.toFixed(2)}});return true;}
// Read-only diagnostic for the floor-height problem: where the head is in the XR reference space and which space the browser gave us.
function xrInfo(){const p=renderer.xr.isPresenting,sess=p?renderer.xr.getSession():null,ref=p?renderer.xr.getReferenceSpace():null,hp=new THREE.Vector3();camera.getWorldPosition(hp);
  return {presenting:p,refSpaceCtor:ref?ref.constructor.name:null,refSpaceType:renderer.xr.getReferenceSpaceType?renderer.xr.getReferenceSpaceType():null,enabledFeatures:sess&&sess.enabledFeatures?[...sess.enabledFeatures]:null,
    boundsPoints:ref&&ref.boundsGeometry?ref.boundsGeometry.length:null,headWorldY:+hp.y.toFixed(3),headLocalY:+camera.position.y.toFixed(3),rigY:+rig.position.y.toFixed(3),rig:{x:+rig.position.x.toFixed(2),z:+rig.position.z.toFixed(2)},
    inputSources:sess?[...sess.inputSources].map(s=>({hand:s.handedness,axes:s.gamepad?s.gamepad.axes.map(a=>+a.toFixed(2)):null})):null,userAgent:navigator.userAgent.slice(0,80)};}
function standBack(){standing=false;if(renderer.xr.isPresenting)rig.position.set(2,rigY,START_Z);else home();log('stand-back');}
// ---- context menu: what you can do with the thing you selected --------------------------------------------------------------------------
let ctxSel=null,ctxResult=[];
let rackOn=false;const rackGroup=new THREE.Group(),rackMeshes=[];modelRoot.add(rackGroup);rackGroup.visible=false;
function buildRack(){if(rackMeshes.length||!data)return;const bs=[...data.beams].sort((a,b)=>b.length-a.length),ROW=10.5,GAP=.22,X0=9.5,Z0=-7,Y=1.3;let x=0,row=0;
  for(const b of bs){if(x>0&&x+b.length>ROW){x=0;row++;}const m=new THREE.Mesh(new THREE.BoxGeometry(b.length,b.width,b.height),new THREE.MeshStandardMaterial({color:palette[b.module],roughness:.83}));
    m.position.set(X0+x+b.length/2,Y,Z0+row*.62);m.userData={beam:b,rack:true};rackGroup.add(m);rackMeshes.push(m);x+=b.length+GAP;}}
function setRack(on){rackOn=on;buildRack();rackGroup.visible=on;for(const m of rackMeshes){const i=picking.indexOf(m);if(on&&i<0)picking.push(m);if(!on&&i>=0)picking.splice(i,1);}if(!on&&ctxSel?.kind==='beam'&&ctxSel.rack){clearProv();ctxSel=null;placeCtx();}log('stock-rack',{on});redrawVR();}
let joints=null;const provGroup=new THREE.Group();modelRoot.add(provGroup);let provHL=[];
function clearProv(){for(const [m,h] of provHL)m.material.emissive.setHex(h);provHL=[];while(provGroup.children.length)provGroup.remove(provGroup.children[0]);}
function showOrigin(){if(ctxSel?.kind!=='beam'||!joints)return;clearProv();const list=joints.per_member[ctxSel.id]||[];ctxResult=provenanceLines(list);
  const partners=new Set(list.map(j=>j.with));for(const mm of picking){const b=mm.userData.beam;if(!b)continue;if(partners.has(b.id)){provHL.push([mm,mm.material.emissive.getHex()]);mm.material.emissive.setHex(0x1a8fa8);}else if(b.id===ctxSel.id&&!mm.userData.rack){provHL.push([mm,mm.material.emissive.getHex()]);mm.material.emissive.setHex(0xd08a00);}}
  for(const j of list){const w=toWorld(j.point),sp=new THREE.Mesh(new THREE.SphereGeometry(.06,12,8),new THREE.MeshBasicMaterial({color:0x1a8fa8}));sp.position.set(w[0],w[1],w[2]);provGroup.add(sp);}
  log('context-origin',{beam:ctxSel.id,joints:list.length});redrawVR();}
let regionHour=null,notchFactor=1;
const REGION_HOURS=[null,9,12,15,18];
function shadeAtHour(sc,iso,hour){const gr=sc.shade_grid;if(iso==='2026-06-21'){const i=data.sun.findIndex(x=>Math.abs(x.hour-hour)<1e-9),r=i<0?-1:gr.hour_index.indexOf(i);if(r>=0)return Promise.resolve(gr.shade_per_hour[r]);}
  if(!bridge.on)return Promise.resolve(null);return bridge.shade(shadeRequest(sc,{iso,hour},gridRect(gr),gr.step)).then(j=>j.error||!j.shaded?null:j.shaded);}
function ctxCaps(){return {regionHour,canRegionTime:!!(region&&(when.iso==='2026-06-21'||bridge.on)),canSelectMembers:!!(region&&lastRegionGrid),hasJoints:!!joints,bridge:bridge.on,canRemove:!!(current&&!current.beams),canStand:!mr.active&&!!standTarget(),standing};}
function ctxView(){const c=contextActions(ctxSel,ctxCaps());if(!c)return null;return {...c,result:ctxResult};}
function ctxFromCell(m){clearProv();if(!region)regionHour=null;const w=m.getWorldPosition(new THREE.Vector3());ctxSel=region?{kind:'region',sub:`${region.area.toFixed(2)} m² · shade ${pct(region.mean)} · sun ${region.sunHours.toFixed(1)} h`}:{kind:'cell',sub:'tap a second cell to draw a region'};ctxSel.anchor=w.toArray();ctxResult=[];placeCtx();redrawVR();}
function ctxFromBeam(mesh){clearProv();const b=mesh.userData.beam,w=mesh.getWorldPosition(new THREE.Vector3());ctxSel={kind:'beam',id:b.id,module:b.module,length:b.length,anchor:w.toArray(),rack:!!mesh.userData.rack};ctxResult=[];placeCtx();redrawVR();}
function placeCtx(){const m=vrPanels.context;if(!m)return;m.visible=!!ctxSel&&!panelsHidden;if(!ctxSel)return;const a=new THREE.Vector3(...ctxSel.anchor),h=new THREE.Vector3();camera.getWorldPosition(h);
  const toHead=h.clone().sub(a);toHead.y=0;if(toHead.lengthSq()<1e-6)toHead.set(0,0,1);toHead.normalize();const dist=Math.hypot(h.x-a.x,h.z-a.z),k=Math.min(3.2,Math.max(1,dist/2.4));   // seen from far away the panel grows, so its text stays readable
  m.position.copy(a).addScaledVector(toHead,Math.min(1.2*k,dist*0.4));m.position.y=Math.max(1.3,a.y+0.9*k);m.scale.setScalar(k);m.lookAt(h.x,m.position.y,h.z);}
async function ctxRemove(){const sc=current;if(!bridge.on||sc.beams||!(ctxSel?.kind==='beam'||ctxSel?.kind==='group'))return;const ids=ctxSel.kind==='group'?ctxSel.ids:[ctxSel.id],id=ids.join(','),base=shadeRequest(sc,when,gridRect(sc.shade_grid),sc.shade_grid.step),after={...base,removed:[...(base.removed||[]),...ids]};
  ctxResult=['Computing…'];redrawVR();const [a,b,c]=await Promise.all([bridge.shade(base),bridge.shade(after),bridge.contact({removed:after.removed})]);
  ctxResult=(a.error||b.error)?['The bridge did not answer']:removeSummary(a.mean_shaded,b.mean_shaded,c);log('context-remove',{beam:id});redrawVR();}
async function ctxRegionTime(){if(!region||!lastRegionGrid)return;const k=(REGION_HOURS.indexOf(regionHour)+1)%REGION_HOURS.length;regionHour=REGION_HOURS[k];
  if(regionHour==null){ctxResult=['Region follows the site time'];redrawVR();return;}
  const gr=lastRegionGrid.gr,[a,b]=await Promise.all([shadeAtHour(current,when.iso,regionHour),shadeAtHour(current,when.iso,when.hour)]);
  ctxResult=(!a||!b)?['No light data for that time (other dates need the bridge)']:[`Region at ${String(regionHour).padStart(2,'0')}:00: ${Math.round(regionShareAt(a,gr,region)*100)}% in shade`,`Site time ${fmtTime(when.hour)}: ${Math.round(regionShareAt(b,gr,region)*100)}% in shade`,'Only this region has its own hour'];
  log('region-time',{hour:regionHour});redrawVR();}
function ctxMembers(){if(!region||!lastRegionGrid)return;const gr=lastRegionGrid.gr,box={x0:gr.x0+region.i0*gr.step,x1:gr.x0+(region.i1+1)*gr.step,y0:gr.y0+region.j0*gr.step,y1:gr.y0+(region.j1+1)*gr.step};
  const removed=new Set(current.removed_beam_ids||[]),list=membersInFootprint((current.beams||data.beams).filter(b=>!removed.has(b.id)),box);
  clearProv();const ids=list.map(b=>b.id),set=new Set(ids);for(const mm of picking){const b=mm.userData.beam;if(b&&!mm.userData.rack&&set.has(b.id)){provHL.push([mm,mm.material.emissive.getHex()]);mm.material.emissive.setHex(0xd08a00);}}
  ctxSel={kind:'group',ids,sub:groupSummary(list),anchor:ctxSel.anchor};ctxResult=ids.length?[`${ids.length} members stand over this footprint`,ids.slice(0,12).join(' ')+(ids.length>12?' …':'')]:['No member stands over this footprint'];
  log('select-members',{n:ids.length});placeCtx();redrawVR();}
function ctxNotchFit(){if(ctxSel?.kind!=='beam'||!joints)return;const F=[1,.8,1.2],k=(F.indexOf(notchFactor)+1)%F.length;notchFactor=F[k];ctxResult=notchFit(joints.per_member[ctxSel.id]||[],ctxSel.length,notchFactor);log('notch-fit-demo',{factor:notchFactor});redrawVR();}
// ---- commands: ask the PC for a new option (own scripts now; a Rhino worker later). The answer becomes a new card in the chain ------------------------------
let gen={state:'idle',text:''};
let engineBusy=false;
let engineStatus='Rhino link not tested';
async function testEngine(){if(engineBusy)return;engineBusy=true;$('testEngine').disabled=true;engineStatus='Testing Rhino geometry…';redrawVR();const receipt=await bridge.engine(shadeRequest(current,when,data.zones.seating,current.shade_grid.step));engineStatus=receipt.status==='ok'?`Rhino: ${receipt.members} members / ${receipt.timber_volume_m3.toFixed(2)} m³ · geometry only`:`Rhino unavailable: ${receipt.reason||receipt.error||'no result'}`;if($('engineStatus'))$('engineStatus').textContent=engineStatus;log('engine-link',{receipt});engineBusy=false;$('testEngine').disabled=false;redrawVR();return receipt;}
function addGenerated(sc){const i=data.scenarios.findIndex(x=>x.id===sc.id);
  if(i>=0)data.scenarios[i]=sc;else{data.scenarios.push(sc);for(const id of ['scenario','reference'])$(id).add(new Option(title(sc),sc.id));}
  changeScenario(data.scenarios.findIndex(x=>x.id===sc.id));}
async function runCommand(text){
  if(!bridge.on){gen={state:'error',text:'Commands need the bridge on the PC'};redrawVR();return null;}
  gen={state:'running',text:`Generating: ${text}`};redrawVR();
  const q=await bridge.generate({text});if(q.error||!q.job){gen={state:'error',text:String(q.error||'The bridge did not accept the command').replace(/^\w+Error: /,'').slice(0,80)};redrawVR();return null;}
  for(let i=0;i<300;i++){const j=await bridge.job(q.job);
    if(j.status==='done'){if(!(j.scenario?.results&&j.scenario.usage&&j.scenario.shade_grid)){gen={state:'error',text:'The answer was incomplete'};redrawVR();return null;}
      addGenerated(j.scenario);gen={state:'done',text:`${title(j.scenario)} · ${(j.ms/1000).toFixed(1)} s · ${j.backend}`};log('generate',{thumb:captureThumb(),text,job:q.job,id:j.scenario.id,backend:j.backend});redrawVR();return j.scenario;}
    if(j.status==='error'||j.error){gen={state:'error',text:String(j.error||'The job failed').replace(/^\w+Error: /,'').slice(0,80)};redrawVR();return null;}
    await new Promise(r=>setTimeout(r,400));}
  gen={state:'error',text:'Timed out'};redrawVR();return null;}
// text and voice go through the same path as the buttons: one sentence in, parsed by the bridge (commands.py), never guessed here
const cmdStatus=()=>{const el=document.getElementById('cmdStatus');if(el)el.textContent=gen.text||'';};
function submitText(text){const t=String(text||'').trim();if(!t)return Promise.resolve(null);return runCommand(t).then(r=>{cmdStatus();return r;});}
function voice(transcript){return submitText(transcript);}                       // a speech recogniser, or a person typing, calls this with the words
function setupCommandBox(){const inp=document.getElementById('cmdText'),go=document.getElementById('cmdGo'),mic=document.getElementById('cmdVoice');if(!inp)return;
  go.onclick=()=>submitText(inp.value);inp.onkeydown=e=>{if(e.key==='Enter')submitText(inp.value);};
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;   // present in some browsers only; not verified in the Quest browser
  if(SR&&mic){mic.hidden=false;mic.onclick=()=>{const r=new SR();r.lang='en-US';r.onresult=e=>{const w=e.results[0][0].transcript;inp.value=w;submitText(w);};r.onerror=e=>{gen={state:'error',text:'Speech: '+e.error};cmdStatus();};r.start();};}}
let regionDraft=null,draftGroup=null;
function regionStrips(x0,x1,z0,z1,dashed,color){const pos=[],idx=[],w=.04,y=.09;let n=0;const quad=(ax,az,bx,bz)=>{const dx=bx-ax,dz=bz-az,l=Math.hypot(dx,dz)||1,px=-dz/l*w/2,pz=dx/l*w/2;pos.push(ax+px,y,az+pz,ax-px,y,az-pz,bx-px,y,bz-pz,bx+px,y,bz+pz);idx.push(n,n+1,n+2,n,n+2,n+3);n+=4;};
  const side=(ax,az,bx,bz)=>{if(!dashed){quad(ax,az,bx,bz);return;}const l=Math.hypot(bx-ax,bz-az),on=.14,off=.09;for(let t=0;t<l;t+=on+off){const e=Math.min(l,t+on);quad(ax+(bx-ax)*t/l,az+(bz-az)*t/l,ax+(bx-ax)*e/l,az+(bz-az)*e/l);}};
  side(x0,z0,x1,z0);side(x1,z0,x1,z1);side(x1,z1,x0,z1);side(x0,z1,x0,z0);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthTest:false}));mesh.renderOrder=13;return mesh;}
function regionFill(x0,x1,z0,z1,color,opacity){const p=new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(x1-x0),Math.abs(z1-z0)),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));p.rotation.x=-Math.PI/2;p.position.set((x0+x1)/2,.085,(z0+z1)/2);p.renderOrder=12;return p;}
const regionBounds=(gr,r,offset)=>({x0:gr.x0+r.i0*gr.step+offset,x1:gr.x0+(r.i1+1)*gr.step+offset,z0:-(gr.y0+r.j0*gr.step),z1:-(gr.y0+(r.j1+1)*gr.step)});
function clearDraftGroup(){if(draftGroup){clearGroup(draftGroup);modelRoot.remove(draftGroup);draftGroup=null;}}
function drawDraft(gr,offset,a,b){const r=regionStats(gr,a,b),q=regionBounds(gr,r,offset);clearDraftGroup();draftGroup=new THREE.Group();draftGroup.add(regionFill(q.x0,q.x1,q.z0,q.z1,0xe0a000,.2),regionStrips(q.x0,q.x1,q.z0,q.z1,true,0xc98a00));modelRoot.add(draftGroup);return r;}
function regionBar(text,{confirm=false,cancel=true,done=false}={}){const b=$('regionBar');if(!b)return;b.hidden=!text;b.classList.toggle('done',done);$('regionText').textContent=text||'';$('regionConfirm').style.display=confirm?'':'none';$('regionCancel').style.display=cancel?'':'none';$('regionCancel').textContent=done?'Clear':'Cancel';}
const draftText=r=>`${r.n} cell${r.n>1?'s':''} · ${r.area.toFixed(2)} m² · shade ${pct(r.mean)}`;
function confirmRegion(){if(!regionDraft)return;const {gr,offset,r}=regionDraft;regionDraft=null;clearDraftGroup();region=r;lastRegionGrid={gr,offset};if(regionOutline)modelRoot.remove(regionOutline);const q=regionBounds(gr,r,offset);
  regionOutline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[q.x0,q.z0],[q.x1,q.z0],[q.x1,q.z1],[q.x0,q.z1]].map(([x,z])=>new THREE.Vector3(x,0.07,z))),new THREE.LineBasicMaterial({color:0x111111}));regionOutline.renderOrder=11;regionOutline.add(regionFill(q.x0,q.x1,q.z0,q.z1,0x203329,.1),regionStrips(q.x0,q.x1,q.z0,q.z1,false,0x111111));modelRoot.add(regionOutline);
  if(regionSprite)infoGroup.remove(regionSprite);regionSprite=textSprite([`Region ${r.area.toFixed(2)} m² (${r.n} cells)`,`Shade ${pct(r.mean)} (${pct(r.min)}–${pct(r.max)}) · sun ${r.sunHours.toFixed(1)} h`,...(r.radiation!==null?[`Direct radiation ${r.radiation.toFixed(1)} of ${r.openRadiation.toFixed(1)} kWh/m² (open ground, simplified clear sky)`]:[])],1180,r.radiation!==null?190:130,3.6);regionSprite.position.set((q.x0+q.x1)/2,1.3,(q.z0+q.z1)/2);infoGroup.add(regionSprite);
  shadeScope='region';regionBar(`Region selected: ${draftText(r)}`,{done:true});log('region');refreshComparison();redrawVR();}
function cancelDraft(){regionDraft=null;pendingCell=null;clearDraftGroup();clearPendingMarker();if(!region)regionBar('');else regionBar(`Region selected: ${draftText(region)}`,{done:true});redrawVR();}
function previewRegion(e){if(!pendingCell||regionDraft||renderer.xr.isPresenting)return;const {grid:gr,offset}=pendingCell.m.userData,rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const o=raycaster.ray.origin,d=raycaster.ray.direction;if(d.y>=-1e-4)return;const t=-o.y/d.y,x=o.x+d.x*t,z=o.z+d.z*t,local=modelRoot.worldToLocal(new THREE.Vector3(x,0,z)),i=Math.max(0,Math.min(gr.nx-1,Math.floor((local.x-offset-gr.x0)/gr.step))),j=Math.max(0,Math.min(gr.ny-1,Math.floor((-local.z-gr.y0)/gr.step)));const r=drawDraft(gr,offset,pendingCell.cell,i*gr.ny+j);regionBar(`Click the opposite corner: ${draftText(r)}`);}
function clearRegion(){if(standing)standBack();regionDraft=null;clearDraftGroup();regionBar('');pendingCell=null;region=null;if(regionOutline){modelRoot.remove(regionOutline);regionOutline=null;}if(regionSprite){infoGroup.remove(regionSprite);regionSprite=null;}refreshComparison();redrawVR();}
function selectCell(m){queueMicrotask(()=>ctxFromCell(m));const {grid:gr,cell,scenario,offset}=m.userData;const rowArr=cellShade(scenario);
  const i=Math.floor(cell/gr.ny),j=cell%gr.ny;
  $('selection').innerHTML=`<b>Ground cell ${i+1}-${j+1}</b> (${gr.step*100} cm)<br>whole-day shade ${pct(gr.cell_mean[cell])} · direct radiation ${gr.radiation_kwh_m2?.[cell]?.toFixed(2)??'no data'} kWh/m² · now: ${rowArr?(rowArr[cell]?'in shade':'in sun'):'no data for this time'}<br><small>Configuration: ${scenario.id}. Simplified clear-sky direct light; assumed date and site.</small>`;
  if(regionSprite){infoGroup.remove(regionSprite);regionSprite=null;}
  if(regionDraft){const d=regionDraft,inside=d.gr===gr&&d.offset===offset&&i>=d.r.i0&&i<=d.r.i1&&j>=d.r.j0&&j<=d.r.j1;if(inside){confirmRegion();return;}cancelDraft();}
  if(pendingCell&&pendingCell.m.userData.scenario===scenario&&pendingCell.m.userData.offset===offset){   // second click: a dashed draft that waits for confirmation (the same cell twice is a one-cell region)
    const r=drawDraft(gr,offset,pendingCell.cell,cell);regionDraft={gr,offset,r};pendingCell=null;clearPendingMarker();regionBar(`${draftText(r)} · dashed until you confirm`,{confirm:true});log('region-draft',{cells:r.n});}
  else{pendingCell={m,cell};region=null;regionBar('Corner set. Move to the opposite corner and click.');setPendingMarker(gr.x0+(i+.5)*gr.step+offset,-(gr.y0+(j+.5)*gr.step),gr.step);if(regionOutline){modelRoot.remove(regionOutline);regionOutline=null;}
    const cx=gr.x0+(i+.5)*gr.step+offset,cz=-(gr.y0+(j+.5)*gr.step);regionSprite=textSprite([`Cell ${i+1}-${j+1}`,`Shade ${pct(gr.cell_mean[cell])} · sun ${((1-gr.cell_mean[cell])*gr.shade_per_hour.length).toFixed(1)} h`,...(gr.radiation_kwh_m2?[`Direct radiation ${gr.radiation_kwh_m2[cell].toFixed(2)} kWh/m²`]:[])],760,170,2.0);regionSprite.position.set(cx,1.0,cz);infoGroup.add(regionSprite);log('cell');}
  refreshComparison();redrawVR();}
// Colour highlights geometric differences; structural checks remain separate.
function applyHighlights(){paintComparison();for(const m of picking){if(m.userData.beam)m.material.emissive.setHex(m===selected?0x50652d:0);}}
function renderIntent(){const el=$('intent');if(!el)return;el.replaceChildren();for(const g of GOALS.filter(g=>g.id!=='passage')){const b=document.createElement('button');const r=intent.roles[g.id];b.textContent=`${g.label} · ${{core:'Core',constraint:'Constraint',ignore:'Ignore'}[r]}`;b.className=r==='core'?'active':'';
  b.onclick=()=>{intent.roles[g.id]=nextRole(r);log('role',{goal:g.id,role:intent.roles[g.id]});renderIntent();redrawVR();};el.append(b);}}
function selectBeam(mesh){if(selected===mesh&&decisionTier==='member'){selected.material.emissive.setHex(selected.userData.flag?0xc02a2a:0);selected=null;$('selection').innerHTML='<small>Click a timber member to see its details</small>';log('select-beam',{beam:null});refresh();return;}queueMicrotask(()=>ctxFromBeam(mesh));if(selected)selected.material.emissive.setHex(selected.userData.flag?0xc02a2a:0);selected=mesh;mesh.material.emissive.setHex(0x50652d);const b=mesh.userData.beam;$('selection').innerHTML=`<b>${b.id} / module ${b.module}</b><br>Length ${(b.length*1000).toFixed(0)} mm · section ${(b.width*1000).toFixed(0)} × ${(b.height*1000).toFixed(0)} mm<br><small>Wood defects: no data; structural utilisation: not computed</small>`;log('select-beam',{beam:b.id});refresh();}
// ---- headset interface: three world-space panels (see vrui.js for the design rules) ----------------------------------
const previewVR=new URLSearchParams(location.search).has('vr');
let ack=false,goalVersion=1,vrHeadYaw=0,usage='u4',pendingCell=null,region=null,regionOutline=null,viewMode='day';
let when={iso:'2026-06-21',hour:13};const bridge=new Bridge(new URLSearchParams(location.search).get('bridge')||`${location.origin}/api`);const liveCache=new Map(),livePending=new Set();let liveMs=null;const intent=structuredClone(DEFAULT_INTENT);
const vrGroup=new THREE.Group();vrGroup.visible=false;scene.add(vrGroup);const vrPanels={},vrTarget={};let vrScreens=null;
// Python may still be building its contact graph when the page first opens.
// Recover the live connection without requiring a page reload.
const bridgeRetry=setInterval(async()=>{if(!data||bridge.on)return;await bridge.connect();if(bridge.on){requestLive();redrawVR();}},3000);
addEventListener('beforeunload',()=>clearInterval(bridgeRetry));
for(const id of ['left','centre','right','sun','context']){const sz=SIZES[id],cv=document.createElement('canvas');cv.width=sz.px[0];cv.height=sz.px[1];const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(sz.w,sz.h),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,transparent:true,depthWrite:false}));m.userData={screenId:id,canvas:cv,tex};vrGroup.add(m);vrPanels[id]=m;if(id==='context')m.visible=false;}
const structText=s=>s.structure_result?`${(s.structure_result.max_displacement_m*1000).toFixed(1)} mm · utilisation ${s.structure_result.max_utilisation.toFixed(2)} (${s.structure_result.source})`:'not done';
function scenInfo(s){const target=Number($('target').value)/100,hour=Number($('hour').value);const i=summary(data,s,target),b=briefStatus(data,s),cs=cellStats(s),p=s.structure_proxy;
  return {id:s.id,title:title(s),struct:structText(s),shade:i.shade,clear:i.clear,intruders:i.intruders,shadePass:i.shadePass,count:i.count,area:b?b.area:0,height:b?b.height:0,briefOk:b?b.ok:true,
    floating:p?p.floating_beam_ids.length:0,under:p?p.under_supported_beam_ids.length:0,cellsNow:cs?cs.now:0,cellsN:cs?cs.n:0,verdict:coreVerdict(intent.roles,goalStatuses(i,b,stageStatus(data,s)))};}
function vrState(){const z=data.zones,st=data.site,cur=scenInfo(current),ref=scenInfo(reference);
  const goals=goalStatuses(summary(data,current,Number($('target').value)/100),briefStatus(data,current),stageStatus(data,current)).filter(g=>g.id!=='passage');
  return {engineStatus,visual:comparisonFacts?{mode:compareMode,focus:compareFocus,local:localOverlap,ghostOpacity,differencesOnly,facts:comparisonFacts,explanation:explanation(comparisonFacts,compareFocus)}:null,cmp:compareInfo(current,reference),basis:basisLabel(current),checks:checkChips(current),deficit:(()=>{const t=Number($('target').value)/100,d=deficitStats(current.shade_grid,t),cl=exposedClusters(current.shade_grid,t);return {...d,blocks:cl.length,biggest:cl[0]||null};})(),viewMode,radiationMax:current.shade_grid?.open_kwh_m2??null,mr:{active:mr.active,placing:mr.placing,placed:mr.placed,ready:mr.ready,error:mr.error},goals,intent:{users:intent.users,uses:intent.uses,roles:intent.roles},showCells,region,ack,goalVersion,target:Number($('target').value)/100,hour:when.hour,sun:sunState(),level,comparison,pref:$('pref').value?Number($('pref').value):null,cur,ref,
    siteLine:`Zurich ${st.date}`,seatLine:`${z.seating.persons||2} people · ${(z.seating.x_max-z.seating.x_min).toFixed(1)}×${(z.seating.y_max-z.seating.y_min).toFixed(1)} m`,passageLine:`width ${(z.passage.y_max-z.passage.y_min).toFixed(1)} m, height ${z.passage.clear_height} m`,
    eyeHeight,usage:{id:usage,options:(data.usage_options||[]).map(u=>({id:u.id,persons:u.persons}))},rows:decisionRows(stateLog,data),graph:branchLayout(stateLog),canStand:!mr.active&&!!standTarget(),rackOn,gen,bridgeOn:bridge.on,ctx:ctxView(),standing,story:storyLayout(stateLog,Object.fromEntries(data.scenarios.map(x=>[x.id,title(x)])),history.head),thumbs:Object.fromEntries(stateLog.filter(e=>e.thumb).map(e=>[e.id,thumbOf(e)]))};}
function redrawVR(){if(!data||!(vrGroup.visible||previewVR))return;vrScreens=buildScreens(vrState());
  for(const id of ['left','centre','right','sun',...(vrScreens.context?['context']:[])]){const m=vrPanels[id];drawScreen(m.userData.canvas.getContext('2d'),vrScreens[id]);m.userData.tex.needsUpdate=true;}}
function headPose(){const p=new THREE.Vector3(),d=new THREE.Vector3();camera.getWorldPosition(p);camera.getWorldDirection(d);return {head:{x:p.x,y:p.y,z:p.z},yaw:Math.atan2(-d.x,-d.z)};}
function modelFloorPivot(){const box=new THREE.Box3();for(const mesh of assembly.children){if(!mesh.userData.beam)continue;mesh.updateMatrix();mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix));}
  if(box.isEmpty())return new THREE.Vector3();const centre=box.getCenter(new THREE.Vector3());return new THREE.Vector3(centre.x,box.min.y,centre.z);}
function placeModelAt(anchor){const p=placementOffset(mr.pivot,anchor,mr.yaw);modelRoot.rotation.y=mr.yaw;modelRoot.position.set(p.x,p.y,p.z);modelRoot.updateMatrixWorld(true);}
function beginModelPlacement(){if(!mr.active)return;mr.placing=true;mr.ready=false;placementRing.visible=false;modelRoot.visible=mr.placed;hintKey='';redrawVR();}
function rotatePlacedModel(degrees){if(!mr.active)return;mr.yaw+=THREE.MathUtils.degToRad(degrees);mr.initializedYaw=true;if(mr.placed||mr.ready)placeModelAt(mr.anchor);log('mr-rotate',{degrees,yaw:mr.yaw});redrawVR();}
function confirmModelPlacement(){if(!mr.active||!mr.placing||!mr.ready)return false;mr.placing=false;mr.placed=true;mr.ready=false;placementRing.visible=false;hintKey='';log('mr-place',{anchor:mr.anchor.toArray(),yaw:mr.yaw,scale:1});redrawVR();return true;}
async function beginMRSession(session){mr.active=true;mr.session=session;mr.placing=true;mr.placed=false;mr.ready=false;mr.initializedYaw=false;mr.error='';mr.yaw=0;mr.pivot.copy(modelFloorPivot());modelRoot.position.set(0,0,0);modelRoot.rotation.set(0,0,0);modelRoot.visible=false;
  ground.visible=false;groundGrid.visible=false;scalePost.visible=false;scene.background=null;scene.fog=null;renderer.setClearAlpha(0);placementRing.visible=false;
  try{const viewer=await session.requestReferenceSpace('viewer'),source=await session.requestHitTestSource({space:viewer});if(mr.session!==session){source.cancel();return;}mr.hitSource=source;redrawVR();}
  catch(e){mr.error=`Floor detection unavailable: ${e.message}`;$('status').textContent=mr.error;redrawVR();}}
function updateMRPlacement(frame){if(!mr.active||!mr.placing||!mr.hitSource||!frame)return;
  const hits=frame.getHitTestResults(mr.hitSource),pose=hits[0]?.getPose(renderer.xr.getReferenceSpace());
  if(!pose){if(mr.ready){mr.ready=false;redrawVR();}placementRing.visible=false;return;}
  const q=pose.transform.orientation,up=new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));
  if(Math.abs(up.y)<.75){if(mr.ready){mr.ready=false;redrawVR();}placementRing.visible=false;return;}
  const p=pose.transform.position;mr.anchor.set(p.x,p.y,p.z);
  if(!mr.initializedYaw){mr.yaw=headPose().yaw;mr.initializedYaw=true;}
  placeModelAt(mr.anchor);modelRoot.visible=true;if(!mr.ready){mr.ready=true;redrawVR();}placementRing.position.set(p.x,p.y+.015,p.z);placementRing.visible=true;
}
function endMRSession(){if(!mr.active)return false;mr.hitSource?.cancel();mr.session=null;mr.hitSource=null;mr.active=false;mr.placing=false;mr.placed=false;mr.ready=false;placementRing.visible=false;
  modelRoot.position.set(0,0,0);modelRoot.rotation.set(0,0,0);modelRoot.visible=true;ground.visible=true;scene.background=desktopBackground;scene.fog=desktopFog;renderer.setClearAlpha(1);
  if(mr.previousMode){compareMode=mr.previousMode;comparison=compareMode!=='single';mr.previousMode=null;build();}return true;}
function placeVR(immediate){const {head,yaw}=headPose();vrHeadYaw=yaw;vrHeadPos={x:head.x,z:head.z};const t=placePanels(head,yaw);Object.assign(vrTarget,t);
  if(immediate)for(const id of ['left','centre','right','sun']){const m=vrPanels[id];m.rotation.order='YXZ';m.position.set(t[id].x,t[id].y,t[id].z);m.rotation.y=t[id].rotY;m.rotation.x=t[id].tiltX||0;}}
let vrHeadPos=null;
// Smooth locomotion (author's request): left stick walks, right stick turns continuously. No teleport turn, no snap.
const _Y=new THREE.Vector3(0,1,0),_q=new THREE.Quaternion(),_hp=new THREE.Vector3(),_off=new THREE.Vector3();
function locomote(dt){if(!renderer.xr.isPresenting)return;const session=renderer.xr.getSession();if(!session)return;let L=null,R=null;
  for(const src of session.inputSources){if(!src.gamepad)continue;if(src.handedness==='left')L=stickOf(src.gamepad);else if(src.handedness==='right')R=stickOf(src.gamepad);controllerButtons(src);}
  updateHints();
  if(mr.active)return; // Physical walking must not shift a model placed in the real room.
  if(R){const a=turnStep(R,dt);if(a!==0){camera.getWorldPosition(_hp);_q.setFromAxisAngle(_Y,a);rig.quaternion.premultiply(_q);_off.copy(rig.position).sub(_hp).applyQuaternion(_q);rig.position.copy(_hp).add(_off);}}   // turn about the head, so the view does not swing around
  if(L){const {yaw}=headPose();const m=moveStep(yaw,L,dt);if(m.x||m.z){rig.position.x+=m.x;rig.position.z+=m.z;}}}
const START_Z=4.2;   // metres in front of the model's front edge (was 7.5: the 7.3 m wide pavilion looked like a small model from there)
// 1:1 check: a 1.8 m reference post with 0.5 m marks, standing next to the start point; shown only inside the headset
const scalePost=new THREE.Group();{const post=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,1.8,10),new THREE.MeshBasicMaterial({color:0xb3392f}));post.position.y=.9;scalePost.add(post);
  for(let k=0;k<=3;k++){const tick=new THREE.Mesh(new THREE.BoxGeometry(.12,.012,.012),new THREE.MeshBasicMaterial({color:0x16261d}));tick.position.y=k*.5+.006;scalePost.add(tick);}
  const lab=textSprite(['1.8 m reference post'],560,70,.5);lab.position.set(0,1.95,0);scalePost.add(lab);}
scalePost.position.set(3.2,0,START_Z-1.2);scalePost.visible=false;scene.add(scalePost);
// ---- floor height: adapt to the user instead of trusting the headset's floor (author: standing up, the floor sat at the waist) ----
const EYE_STAND=1.6,EYE_SIT=1.15;let rigY=0,posture='stand',eyeHeight=EYE_STAND;
function setEyeHeight(target,why){const h=camera.position.y;if(!(h>0.2&&h<2.6))return false;rigY=target-h;rig.position.y=rigY;eyeHeight=target;log('floor',{why,headLocalY:+h.toFixed(3),eyeHeight:target,rigY:+rigY.toFixed(3)});return true;}
function autoFloor(){posture='stand';setEyeHeight(EYE_STAND,'session start: eye height set, the headset floor is not trusted');}
function nudgeEye(d){if(setEyeHeight(Math.max(.8,Math.min(2.2,eyeHeight+d)),'user nudge')){placeVR(true);redrawVR();}}   // below 1.3 m: the headset's floor is too high for a standing adult (or the user is seated: toggle with the left stick click)
function toggleSeated(){posture=posture==='stand'?'sit':'stand';setEyeHeight(posture==='stand'?EYE_STAND:EYE_SIT,'user: '+posture);placeVR(true);redrawVR();}
// ---- controller: panels pinned where a controller points (they do NOT follow the head), one-key hide, visible controllers with button hints ----
let panelsHidden=false,hintsOn=true,hintKey='';const prevBtn={left:[],right:[]},ctrlHand={},hintSprites={};
function setPanelsHidden(h){panelsHidden=h;for(const id of ['left','centre','right','sun'])if(vrPanels[id])vrPanels[id].visible=!h;placeCtx();log(h?'panels-hide':'panels-show');}
function pinPanelsWhereIPoint(hand){let ctrl=null;for(let i=0;i<2;i++)if(ctrlHand[i]===hand)ctrl=renderer.xr.getController(i);if(!ctrl)return;
  const d=new THREE.Vector3(0,0,-1).transformDirection(ctrl.matrixWorld),yaw=yawOf(d.x,d.z),{head}=headPose();vrHeadYaw=yaw;vrHeadPos={x:head.x,z:head.z};Object.assign(vrTarget,placePanels(head,yaw));if(panelsHidden)setPanelsHidden(false);log('panels-pin');}
function controllerButtons(src){const hand=src.handedness;if(!src.gamepad||(hand!=='left'&&hand!=='right'))return;const cur=src.gamepad.buttons.map(b=>b.pressed);
  for(const i of buttonEdges(prevBtn[hand],cur)){
    if(hand==='left'&&i===BTN.UPPER)setPanelsHidden(!panelsHidden);                 // Y: hide / show every panel
    else if(mr.active&&i===BTN.LOWER){if(hand==='left')beginModelPlacement();else rotatePlacedModel(15);}
    else if(i===BTN.LOWER)pinPanelsWhereIPoint(hand);                                // X (left) or A (right): put the panels where this controller points
    else if(hand==='right'&&i===BTN.UPPER){hintsOn=!hintsOn;hintKey='';}
    else if(!mr.active&&hand==='left'&&i===BTN.STICK)toggleSeated();
    else if(hand==='right'&&i===BTN.STICK)toggleColumns();}            // B: hide / show the button hints
  prevBtn[hand]=cur;}
function controllerMesh(){const g=new THREE.Group(),dark=new THREE.MeshStandardMaterial({color:0x2d3a33,roughness:.6}),acc=new THREE.MeshStandardMaterial({color:0x3f8a5b,roughness:.5});
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(.017,.02,.11,16),dark);handle.rotation.x=Math.PI/2.6;handle.position.set(0,-.01,.045);g.add(handle);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.04,.009,10,28),dark);ring.rotation.x=Math.PI/2.2;ring.position.set(0,.01,-.03);g.add(ring);
  const stick=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.012,12),acc);stick.position.set(0,.026,-.002);g.add(stick);
  const trig=new THREE.Mesh(new THREE.BoxGeometry(.012,.026,.02),acc);trig.position.set(0,-.012,-.026);g.add(trig);return g;}
function hintLinesBase(hand){const lines=mr.active?(hand==='left'?['LEFT HAND','Look at a floor ring','Trigger: place model','X: move model again','Y: hide / show panels']:['RIGHT HAND','A: rotate model 15°','Trigger: place / pick','B: hide / show hints']):hand==='left'?['LEFT HAND','Stick: walk','Y: hide / show panels','X: put panels where I point','Click stick: seated / standing floor','Trigger: pick']:['RIGHT HAND','Stick: turn smoothly','A: put panels where I point','B: hide / show these hints','Trigger: pick'];
  if(!mr.active)lines.push(hand==='right'?(regionDraft?'Dashed region: trigger inside to confirm, outside to start again':pendingCell?'Corner 1 set: aim at the opposite corner, pull trigger':(region?'Region drawn. Trigger on the ground: new region':'Region: trigger on a ground cell, then on the opposite corner')):'');return lines;}
function hintLines(hand){const l=hintLinesBase(hand);if(hand==='right')l.push('Click stick: light filter');return l;}
function updateHints(){const key=(hintsOn?'1':'0')+(regionDraft?'d':'-')+(pendingCell?'p':'-')+(region?'r':'-')+(renderer.xr.isPresenting?'x':'-')+(mr.active?'m':'-');if(key===hintKey)return;hintKey=key;
  for(const hand of ['left','right']){const old=hintSprites[hand];if(old){old.parent&&old.parent.remove(old);old.material.map.dispose();old.material.dispose();}
    const sp=textSprite(hintLines(hand).filter(Boolean),760,hand==='right'?400:285,.36);sp.visible=hintsOn;sp.position.set(0,.16,0);hintSprites[hand]=sp;
    for(let i=0;i<2;i++)if(ctrlHand[i]===hand)renderer.xr.getControllerGrip(i).add(sp);}}
function stepVR(dt){if(!vrGroup.visible)return;if(ctxSel&&renderer.xr.isPresenting)placeCtx();
  if(renderer.xr.isPresenting){const {yaw}=headPose();const {head}=headPose();if(vrHeadPos&&Math.hypot(head.x-vrHeadPos.x,head.z-vrHeadPos.z)>1.5)placeVR(false);}   // panels stay where they are when the user turns (the side panels, incl. the decision map, must be reachable by looking at them); they follow only after walking away, or on 'Re-centre panels'   // trigger: only after a large turn
  for(const id of ['left','centre','right','sun']){const m=vrPanels[id],t=vrTarget[id];if(!t)continue;                // transition: eased, never a jump
    m.position.set(easeToward(m.position.x,t.x,dt),easeToward(m.position.y,t.y,dt),easeToward(m.position.z,t.z,dt));m.rotation.y=easeToward(m.rotation.y,t.rotY,dt);m.rotation.x=easeToward(m.rotation.x,t.tiltX||0,dt);}}
function setUsage(uid){if(!applyUsage(data,uid))return;usage=uid;$('usage').value=uid;fillConditions();}
function vrAction(id){if(!id)return;
  if(id==='ack'){ack=true;log('ack');}
  else if(id.startsWith('layout:'))setCompareMode(id.slice(7));
  else if(id.startsWith('focus:'))setCompareFocus(id.slice(6));
  else if(id==='overlap:local'){localOverlap=!localOverlap;log('local-overlap');refresh();}
  else if(id==='ghost'){ghostOpacity=ghostOpacity<.45?.6:.25;refresh();}
  else if(id==='diffonly'){differencesOnly=!differencesOnly;log('only-changed',{on:differencesOnly});refresh();recolor();}
  else if(id.startsWith('role:')){const g=id.slice(5);intent.roles[g]=nextRole(intent.roles[g]);log('role',{goal:g,role:intent.roles[g]});renderIntent();refresh();}
  else if(id==='region:clear')clearRegion();
  else if(id==='place:move')beginModelPlacement();
  else if(id==='place:left')rotatePlacedModel(-15);
  else if(id==='place:right')rotatePlacedModel(15);
  else if(id==='place:confirm')confirmModelPlacement();
  else if(id==='cells')toggleCells();
  else if(id.startsWith('target:')){$('target').value=Math.max(10,Math.min(90,Number($('target').value)+Number(id.slice(7))));log('target');refresh();}
  else if(id==='mode')cycleLightMode();
  else if(id==='goal'){goalVersion+=1;log('goal',{thumb:captureThumb(),goalId:`I${goalVersion}`,roles:{...intent.roles},target:Number($('target').value)/100,hour:Number($('hour').value)});}
  else if(id.startsWith('usage:')){setUsage(id.slice(6));log('usage');build();}
  else if(id.startsWith('scn:')){const sid=id.slice(4);if(sid==='next'){const main=new Set(['all','opt_raise20','opt_rot90','opt_low','opt_wide','sys_arch','sys_portal']),rest=data.scenarios.filter(x=>activeOption(x)&&!main.has(x.id)),k=rest.findIndex(x=>x.id===current.id);changeScenario(data.scenarios.indexOf(rest[(k+1)%rest.length]));}else changeScenario(data.scenarios.findIndex(x=>x.id===sid));}
  else if(id==='ref'){reference=current;$('reference').value=current.id;log('reference');build();}
  else if(id==='ref:next'){const choices=data.scenarios.filter(activeOption);reference=choices[(choices.indexOf(reference)+1)%choices.length];$('reference').value=reference.id;log('reference');build();}
  else if(id.startsWith('level:'))setLevel(Number(id.slice(6)));
  else if(id==='compare')toggleComparison();
  else if(id.startsWith('hour:'))setWhen(when.iso,Number(id.slice(5)));
  else if(id.startsWith('date:'))setWhen(id.slice(5),when.hour);
  else if(id.startsWith('year:'))setWhen(dateFromFraction(Number(id.slice(5))),when.hour);
  else if(id.startsWith('dial:')){const [dx,dy]=id.slice(5).split(',').map(Number),h=nearestHourOnArc(dayArc(when.iso),dx,dy,0,0,1);if(h!==null)setWhen(when.iso,h);}
  else if(id.startsWith('pref:')){$('pref').value=id.slice(5);}
  else if(id==='record')recordDecision();
  else if(id==='recenter')placeVR(false);
  else if(id==='stand'||id==='ctx:stand'){standing?standBack():standHere();placeCtx();}
  else if(id==='rack')setRack(!rackOn);
  else if(id==='eye:-')nudgeEye(-.05);
  else if(id==='eye:+')nudgeEye(.05);
  else if(id==='eye:reset'){posture='stand';if(setEyeHeight(EYE_STAND,'user reset')){placeVR(true);redrawVR();}}
  else if(id==='engine')testEngine();
  else if(id.startsWith('cmd:'))runCommand(id.slice(4));
  else if(id==='ctx:remove')ctxRemove();
  else if(id==='ctx:origin')showOrigin();
  else if(id==='ctx:regiontime')ctxRegionTime();
  else if(id==='ctx:members')ctxMembers();
  else if(id==='ctx:notchfit')ctxNotchFit();
  else if(id==='ctx:close'){clearProv();ctxSel=null;ctxResult=[];placeCtx();}
  else if(id.startsWith('restore:')){$('historyState').value=id.slice(8);$('restore').onclick();}
  redrawVR();}
function interact(origin,direction){raycaster.set(origin,direction);const hits=raycaster.intersectObjects([...(vrGroup.visible?Object.values(vrPanels).filter(m=>m.visible):[]),...picking.filter(m=>!m.userData.cellPick||m.userData.cellLayer.visible)],false);if(!hits.length)return;const h=hits[0];
  if(h.object.userData.screenId){if(vrScreens)vrAction(hitWidget(vrScreens[h.object.userData.screenId],h.uv.x,h.uv.y));}
  else if(h.object.userData.cellPick){if(h.object.userData.cellLayer.visible){const cell=cellFromHit(h);if(cell)selectCell(cell);}}else selectBeam(h.object);}
renderer.domElement.addEventListener('click',e=>{const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);interact(raycaster.ray.origin,raycaster.ray.direction);});
function changeScenario(index){if(index<0||!data.scenarios[index])return;tick();current=data.scenarios[index];$('scenario').value=current.id;setDecisionTier(tierOf(current),true);log('scenario');build();fitComparison();}
function setLevel(value){level=value;document.querySelectorAll('[data-level]').forEach(b=>b.classList.toggle('active',Number(b.dataset.level)===level));log('level');refresh();}
function toggleComparison(){setCompareMode(compareMode==='single'?'beside':'single');}
function recordDecision(){tick();log('decision',{thumb:captureThumb(),task:$('task').textContent,preference:$('pref').value?Number($('pref').value):null,dwellMsByScenario:{...dwell},seatingZoneInViewShare:Object.fromEntries(Object.entries(viewTime).map(([k,v])=>[k,viewShare(v)])),resultSummary:summary(data,current,Number($('target').value)/100).text,rationale:$('rationale').value.trim()||null});$('status').textContent='Decision and reason recorded; can be exported as JSON';}
$('restore').onclick=()=>{if(!$('historyState').value)return;const state=history.resume($('historyState').value,$('rationale').value.trim()||null);current=data.scenarios.find(s=>s.id===state.scenario);reference=data.scenarios.find(s=>s.id===state.reference);if(state.roles)intent.roles={...state.roles};renderIntent();if(state.usage&&state.usage!==usage)setUsage(state.usage);compareMode=state.compareMode||(state.comparison?'beside':'single');compareFocus=state.compareFocus||'all';localOverlap=state.localOverlap||false;ghostOpacity=state.ghostOpacity??.28;differencesOnly=state.differencesOnly||false;level=state.level;goalVersion=state.goalVersion||goalVersion;comparison=state.comparison;$('scenario').value=current.id;$('reference').value=reference.id;$('target').value=state.target;if(state.when){when={...state.when};}document.querySelectorAll('[data-level]').forEach(b=>b.classList.toggle('active',Number(b.dataset.level)===level));$('compare').textContent=comparison?'Single view':'Side by side';build();fitComparison();if(state.selectedBeam){const m=picking.find(m=>m.userData.beam?.id===state.selectedBeam&&m.userData.scenario===current.id);if(m)selectBeam(m);}updateHistory();refresh();};
$('usage').onchange=()=>{setUsage($('usage').value);log('usage');build();};
$('scenario').onchange=()=>changeScenario(data.scenarios.findIndex(s=>s.id===$('scenario').value));
$('reference').onchange=()=>{reference=data.scenarios.find(s=>s.id===$('reference').value);log('reference');build();fitComparison();};
$('target').oninput=()=>{log('target');refresh();};$('hour').oninput=()=>setWhen('2026-06-21',data.sun[Number($('hour').value)].hour);
document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>setLevel(Number(b.dataset.level)));
$('cells').onclick=()=>toggleCells();if($('columns'))$('columns').onclick=toggleColumns;$('seatview').onclick=seatView;$('compare').onclick=toggleComparison;$('home').onclick=home;$('record').onclick=recordDecision;
$('export').onclick=()=>{const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify({source:data.source,site:data.site,zones:data.zones,history:history.export()},null,2)],{type:'application/json'}));a.href=url;a.download='hardleaf-decision-log.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
for(let i=0;i<2;i++){const controller=renderer.xr.getController(i);rig.add(controller);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-9)]),new THREE.LineBasicMaterial({color:0x446e50}));controller.add(line);controller.addEventListener('selectstart',()=>{const origin=new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);const dir=new THREE.Vector3(0,0,-1).transformDirection(controller.matrixWorld);if(mr.active&&mr.placing){raycaster.set(origin,dir);const panels=Object.values(vrPanels).filter(m=>m.visible);if(raycaster.intersectObjects(panels,false).length){interact(origin,dir);return;}confirmModelPlacement();return;}interact(origin,dir);});
  const grip=renderer.xr.getControllerGrip(i);rig.add(grip);grip.add(controllerMesh());
  controller.addEventListener('connected',e=>{ctrlHand[i]=e.data.handedness;hintKey='';});controller.addEventListener('disconnected',()=>{delete ctrlHand[i];hintKey='';});}
let mrRequested=false;
renderer.xr.addEventListener('sessionstart',()=>{const session=renderer.xr.getSession(),ar=mrRequested;mrRequested=false;sunLight.castShadow=false;controls.enabled=false;camera.clearViewOffset();document.body.classList.add('xr-active');camera.position.set(0,0,0);rigY=0;rig.quaternion.identity();if(ar){mr.previousMode=compareMode;compareMode='single';comparison=false;build();rig.position.set(0,0,0);void beginMRSession(session);}else{scalePost.visible=true;rig.position.set(2,0,START_Z);}$('panel').hidden=true;vrGroup.visible=true;ack=false;setTimeout(()=>{if(!renderer.xr.isPresenting)return;if(!mr.active)autoFloor();placeVR(true);redrawVR();},1300);log(ar?'mr-enter':'xr-enter');updateMRButton();});
renderer.xr.addEventListener('sessionend',()=>{const wasMR=endMRSession();if(wasMR)renderer.xr.setReferenceSpaceType('local-floor');sunLight.castShadow=true;rigY=0;scalePost.visible=false;controls.enabled=true;document.body.classList.remove('xr-active');vrGroup.visible=previewVR;$('panel').hidden=true;home();log(wasMR?'mr-exit':'xr-exit');updateMRButton();});
const vrButton=VRButton.createButton(renderer);document.body.appendChild(vrButton);
const mrButton=document.createElement('button');mrButton.id='MRButton';mrButton.type='button';mrButton.textContent='Checking room view…';mrButton.disabled=true;document.body.appendChild(mrButton);
let mrSupported=false;
function updateMRButton(){mrButton.textContent=mr.active?'Exit room view':mrSupported?'Place in room':'Room view unavailable';mrButton.disabled=!data||!mrSupported||(renderer.xr.isPresenting&&!mr.active);}
if(navigator.xr&&window.isSecureContext)navigator.xr.isSessionSupported('immersive-ar').then(ok=>{mrSupported=ok;updateMRButton();}).catch(()=>updateMRButton());else updateMRButton();
mrButton.onclick=async()=>{if(mr.active){await renderer.xr.getSession()?.end();return;}if(!data||renderer.xr.isPresenting||!mrSupported)return;
  let session;try{session=await navigator.xr.requestSession('immersive-ar',{requiredFeatures:['hit-test']});mrRequested=true;renderer.xr.setReferenceSpaceType('local');await renderer.xr.setSession(session);}
  catch(e){mrRequested=false;await session?.end().catch(()=>{});mr.error=`Room view could not start: ${e.message}`;$('status').textContent=mr.error;console.warn(e);}};
addEventListener('resize',()=>{camera.aspect=viewWidth()/innerHeight;camera.updateProjectionMatrix();renderer.setSize(viewWidth(),innerHeight);if(!previewVR)fitComparison();});
document.querySelectorAll('[data-compare-mode]').forEach(b=>b.onclick=()=>setCompareMode(b.dataset.compareMode));
document.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>setCompareFocus(b.dataset.focus));
$('allFocus').onclick=()=>setCompareFocus('all');
$('localOverlap').onchange=()=>{localOverlap=$('localOverlap').checked;log('local-overlap');refresh();};
$('ghostOpacity').oninput=()=>{ghostOpacity=Number($('ghostOpacity').value);refresh();};
$('diffOnly').onchange=()=>{differencesOnly=$('diffOnly').checked;log('only-changed',{on:differencesOnly});refresh();recolor();};
$('shadePeriod').onclick=cycleLightMode;
$('advancedToggle').onclick=()=>{$('panel').hidden=!$('panel').hidden;$('advancedToggle').setAttribute('aria-expanded',String(!$('panel').hidden));};
$('fitModels').onclick=fitComparison;
$('testEngine').onclick=testEngine;
setupCommandBox();try{try{joints=await(await fetch('./data/joints.json')).json();}catch(e){joints=null;}data=await(await fetch('./data/scenarios.json')).json();validate(data);reference=data.scenarios[0];current=data.scenarios.find(s=>s.id==='opt_rot90')||reference;for(const id of ['scenario','reference'])for(const s of data.scenarios.filter(activeOption))$(id).add(new Option(title(s),s.id));for(const u of data.usage_options||[])$('usage').add(new Option(`${u.persons}  people · ${(u.seat.x_max-u.seat.x_min).toFixed(1)}×${(u.seat.y_max-u.seat.y_min).toFixed(1)} m`,u.id));applyUsage(data,usage);$('usage').value=usage;setDecisionTier(tierOf(current),true);fillConditions();renderIntent();$('scenario').value=current.id;$('reference').value=reference.id;build();fitComparison();updateMRButton();log('start');if(previewVR){camera.fov=Number(new URLSearchParams(location.search).get('fov'))||85;camera.aspect=viewWidth()/innerHeight;camera.updateProjectionMatrix();renderer.setSize(viewWidth(),innerHeight);$('panel').hidden=true;camera.position.set(2,1.6,7.5);controls.target.set(2,1.3,0);controls.update();vrGroup.visible=true;placeVR(true);redrawVR();const qp=new URLSearchParams(location.search),yw=Number(qp.get('yaw'))||0,pt=Number(qp.get('pitch'))||0;if(yw||pt){const a=yw*Math.PI/180,pp=pt*Math.PI/180;controls.target.set(2-Math.sin(a)*10*Math.cos(pp),1.6+Math.sin(pp)*10,7.5-Math.cos(a)*10*Math.cos(pp));controls.update();}document.body.classList.add('vrpreview');}bridge.connect().then(()=>{requestLive();redrawVR();});
  {const _restore=$('restore').onclick;$('restore').onclick=()=>{_restore();const e=history.events.at(-1);if(e&&e.action==='resume-and-branch'){e.thumb=captureThumb();redrawVR();setFlowStep(1,true);}};}
  const flowAct=ev=>{const t=ev.target.closest('[data-flow-step]');if(t)setFlowStep(Number(t.dataset.flowStep));};const treeAct=ev=>{const t=ev.target.closest('[data-restore]');if(t){$('historyState').value=t.dataset.restore;$('restore').onclick();}};
  const keyed=fn=>ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();fn(ev);}};$('flowChart').addEventListener('click',flowAct);$('flowChart').addEventListener('keydown',keyed(flowAct));$('hsBody').addEventListener('click',ev=>{if(ev.target.closest('#hsRecord')){$('panel').hidden=false;$('advancedToggle').setAttribute('aria-expanded','true');setFlowStep(7);return;}treeAct(ev);});$('hsBody').addEventListener('keydown',keyed(treeAct));$('hsStrip').onclick=()=>{hsMode='strip';renderHistoryStrip();};$('hsTree').onclick=()=>{hsMode='tree';renderHistoryStrip();};$('hsHide').onclick=()=>{hsOpen=!hsOpen;renderHistoryStrip();};addEventListener('resize',renderHistoryStrip);setupAI();fetch('./data/local_search.json').then(r=>r.ok?r.json():null).then(j=>{localSearch=j;renderLocalMap();}).catch(()=>{});
  $('lmHide').onclick=()=>{lmHidden=true;renderLocalMap();};const lmAct=ev=>{const t=ev.target.closest('[data-row]');if(t)pickLocal(t.dataset.row);};$('lmBody').addEventListener('click',lmAct);$('lmBody').addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();lmAct(ev);}});document.querySelectorAll('[data-tier]').forEach(b=>{b.onclick=()=>{setDecisionTier(b.dataset.tier);refresh();recolor();};});
  let previewQueued=null;renderer.domElement.addEventListener('pointermove',e=>{if(!pendingCell||regionDraft)return;if(!previewQueued)requestAnimationFrame(()=>{const ev=previewQueued;previewQueued=null;if(ev)previewRegion(ev);});previewQueued=e;});
  $('regionConfirm').onclick=confirmRegion;$('regionCancel').onclick=()=>{if($('regionBar').classList.contains('done'))clearRegion();else cancelDraft();};addEventListener('keydown',ev=>{if(ev.key==='Escape'&&(pendingCell||regionDraft))cancelDraft();if(ev.key==='Enter'&&regionDraft&&ev.target.tagName!=='TEXTAREA')confirmRegion();});
  $('saveFigure').onclick=saveComparisonFigure;$('dockToggle').onclick=()=>{$('comparisonDock').classList.toggle('collapsed');syncDock();};syncDock();$('diffPickBtn').onclick=()=>{const p=$('diffPick');p.hidden=!p.hidden;$('diffPickBtn').setAttribute('aria-expanded',String(!p.hidden));};
  document.querySelectorAll('[data-metric]').forEach(i=>{i.onchange=()=>{compareMetrics[i.dataset.metric]=i.checked;log('compare-metrics',{metrics:{...compareMetrics}});refresh();};});document.querySelectorAll('input[name="scope"]').forEach(i=>{i.onchange=()=>{shadeScope=i.value;log('compare-scope',{scope:shadeScope});refresh();};});
  const typing=t=>t&&(t.tagName==='TEXTAREA'||(t.tagName==='INPUT'&&t.type!=='range'&&t.type!=='checkbox'));
  addEventListener('keydown',ev=>{const c=ev.code;if(typing(ev.target)||ev.ctrlKey||ev.metaKey||ev.altKey)return;if(c==='ShiftLeft'||c==='ShiftRight'){walkKeys.add(c);return;}if(!WALK_MAP[c])return;if(c.startsWith('Arrow')&&ev.target&&['SELECT','INPUT'].includes(ev.target.tagName))return;ev.preventDefault();walkKeys.add(c);document.querySelector(`[data-walk="${c}"]`)?.classList.add('on');});
  addEventListener('keyup',ev=>{walkKeys.delete(ev.code);document.querySelector(`[data-walk="${ev.code}"]`)?.classList.remove('on');});addEventListener('blur',()=>{walkKeys.clear();document.querySelectorAll('[data-walk].on').forEach(b=>b.classList.remove('on'));});
  document.querySelectorAll('[data-walk]').forEach(b=>{const on=e=>{e.preventDefault();walkKeys.add(b.dataset.walk);b.setPointerCapture?.(e.pointerId);},off=()=>walkKeys.delete(b.dataset.walk);b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointercancel',off);});$('walkIn').onclick=walkIn;
  $('flowPrev').onclick=()=>setFlowStep(flowStep-1);$('flowNext').onclick=()=>setFlowStep(flowStep===FLOW_STEPS.length?1:flowStep+1);$('rackToggle').onclick=()=>{setRack(!rackOn);$('rackToggle').textContent=rackOn?'Hide timber stock rack':'Show timber stock rack';};renderFlow();
  window.hardleaf={flowStep:()=>flowStep,setFlowStep,decisionTreeNodes:()=>[...document.querySelectorAll('#hsBody [data-restore]')].map(g=>g.dataset.restore),setHistoryMode:m=>{hsMode=m;renderHistoryStrip();},beamScreen:id=>{const m=picking.find(x=>x.userData.beam?.id===id);if(!m)return null;const v=m.getWorldPosition(new THREE.Vector3());m.geometry.computeBoundingBox?.();m.geometry.boundingBox.getCenter(_wd);m.localToWorld(_wd);v.copy(_wd).project(camera);const r=renderer.domElement.getBoundingClientRect();return [r.left+(v.x+1)/2*r.width,r.top+(1-v.y)/2*r.height];},comparisonFigure,pickLocal,aiParams,localSearchInfo:()=>localSearch&&{rows:localSearch.rows.length},regionDraftInfo:()=>regionDraft?regionDraft.r:null,setDecisionTier:t=>{setDecisionTier(t);refresh();recolor();},decisionTier:()=>decisionTier,confirmRegion,cancelDraft,shadeScope:()=>shadeScope,figureTree:(o,names={})=>treeSVG(storyLayout(stateLog,{...Object.fromEntries(data.scenarios.map(x=>[x.id,title(x)])),...names},history.head,500),historyInfo(),o),hideSpatialLabels:()=>{let n=0;spatial.group.traverse(o=>{if(o.isSprite||o.userData?.label){o.visible=false;n++;}});return n;},xrInfo,filterInfo:()=>({on:showColumns,inside:veilInside,visible:lightVeil.visible,color:lightVeil.material.color.toArray().map(v=>+v.toFixed(2)),head:camera.getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(2))}),lookFromForTest:(x,y,z,tx,ty,tz)=>{camera.position.set(x,y,z);controls.target.set(tx,ty,tz);controls.update();},renderMetrics:()=>({xr:renderer.xr.isPresenting,frameMs:+frameMs.toFixed(1),drawCalls:renderer.info.render.calls,cellLayers:cellLayers.length,gridCells:cellLayers.reduce((n,x)=>n+x.grid.nx*x.grid.ny,0),picking:picking.length,shadow:sunLight.castShadow}),selectBeamById:id=>{const m=picking.find(x=>x.userData&&x.userData.beam&&x.userData.beam.id===id);if(!m)return {ok:false,reason:'beam not in picking list',n:picking.length};selectBeam(m);return {ok:true};},ctxInfo:()=>{const m=vrPanels.context;return {ctxKind:ctxSel?ctxSel.kind:null,panelVisible:m?m.visible:null,pos:m?m.position.toArray().map(v=>+v.toFixed(2)):null,scale:m?+m.scale.x.toFixed(2):null,vrGroupVisible:vrGroup.visible,previewVR,hasContextScreen:!!(vrScreens&&vrScreens.context),panelsHidden};},screensJSON:()=>vrScreens?JSON.parse(JSON.stringify(vrScreens)):null,setCompareMode,setCompareFocus,comparisonFacts:()=>comparisonFacts,comparisonDebug:()=>({mode:compareMode,focus:compareFocus,offset:referenceOffset,ghostOpacity,localOverlap,localBox:localBox(),annotations:spatial.group.userData,referenceClipped:comparisonGroup.children.filter(m=>m.userData.beam&&m.material.clippingPlanes?.length).length}),view:(pos,target)=>{camera.position.set(...pos);controls.target.set(...target);controls.update();placeCtx();},ctxAnchor:()=>ctxSel&&ctxSel.anchor,voice,command:runCommand,genState:()=>gen,scenarioIds:()=>data.scenarios.map(x=>x.id),regionHour:()=>regionHour,rackOn:()=>rackOn,rackCount:()=>rackMeshes.length,hasJoints:()=>!!joints,ctxState:()=>ctxView(),ctxPanelVisible:()=>vrPanels.context.visible,clickBeam:(id)=>{const mm=picking.find(x=>x.userData.beam&&(id==null||x.userData.beam.id===id));if(mm)selectBeam(mm);return !!mm;},standHere,standBack,cameraPos:()=>camera.getWorldPosition(new THREE.Vector3()).toArray(),panelPNG:(id)=>vrPanels[id].userData.canvas.toDataURL('image/png'),bridge,when:()=>when,setWhen,cellShade:(sc)=>cellShade(sc||current),clickCell:(k)=>{const entry=cellLayers.find(x=>x.offset===0),m=entry?cellAtIndex(entry,k):null;if(m)selectCell(m);},vrRegion:()=>region,vrDebug:()=>({cam:camera.position.toArray(),panels:Object.fromEntries(Object.entries(vrPanels).map(([k,m])=>[k,{p:m.position.toArray().map(v=>+v.toFixed(2)),ry:+m.rotation.y.toFixed(2),t:vrTarget[k]?[vrTarget[k].x,vrTarget[k].y,vrTarget[k].z].map(v=>+v.toFixed(2)):null}]))}),vrAction,vrScreens:()=>vrScreens,vrState:()=>vrState(),data,summary:()=>summary(data,current,Number($('target').value)/100),getState:()=>({scenario:current.id,level,comparison,compareMode,compareFocus,localOverlap,selected:selected?.userData.beam.id,logs:stateLog.length})};
  if(new URLSearchParams(location.search).has('testPlacement')){
    const state=()=>({active:mr.active,placing:mr.placing,placed:mr.placed,ready:mr.ready,pivot:mr.pivot.toArray(),anchor:mr.anchor.toArray(),worldPivot:modelRoot.localToWorld(mr.pivot.clone()).toArray(),position:modelRoot.position.toArray(),yaw:mr.yaw,scale:modelRoot.scale.toArray(),visible:modelRoot.visible,groundVisible:ground.visible,transparent:scene.background===null,compareMode});
    window.hardleaf.testPlacement={
      begin:async()=>{mr.previousMode=compareMode;compareMode='single';comparison=false;build();await beginMRSession({requestReferenceSpace:async()=>({}),requestHitTestSource:async()=>({cancel(){}})});return state();},
      hit:(x,y,z)=>{updateMRPlacement({getHitTestResults:()=>[{getPose:()=>({transform:{position:{x,y,z},orientation:{x:0,y:0,z:0,w:1}}})}]});return state();},
      confirm:()=>{const ok=confirmModelPlacement();return {ok,...state()};},rotate:degrees=>{rotatePlacedModel(degrees);return state();},
      probeCell:cell=>{const entry=cellLayers[0],m=cellAtIndex(entry,cell);if(!m)return null;return cellFromHit({object:entry.pick,point:m.getWorldPosition(new THREE.Vector3())})?.userData.cell;},
      end:()=>{endMRSession();home();return state();},state};
  }
}
catch(e){$('status').textContent=`Load failed: ${e.message}`;console.error(e);}
let lastT=performance.now(),frameMs=0;
renderer.setAnimationLoop((_time,frame)=>{const nowT=performance.now();frameMs=frameMs?frameMs*.9+(nowT-lastT)*.1:nowT-lastT;if(!pendingCell&&pendingMarker)clearPendingMarker();const dtv=Math.min(.1,(nowT-lastT)/1000);updateMRPlacement(frame);locomote(dtv);updateWalk(Math.min(.3,(nowT-lastT)/1000));updateLightVeil(dtv);stepVR(dtv);lastT=nowT;trackView();if(controls.enabled)controls.update();renderer.render(scene,camera);});
