import * as THREE from 'three';
import {COMPARE_COLORS as C} from './compare.js';

// All spatial annotations stay in metres; no per-option scale normalisation.
export class SpatialComparison {
  constructor(scene){this.group=new THREE.Group();this.group.name='spatial-comparison';scene.add(this.group);}
  clear(){this.group.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat().filter(Boolean)){m.map?.dispose();m.dispose();}});this.group.clear();}
  label(text,x,y,z,color=C.current,size=2.6){
    const cv=document.createElement('canvas');cv.width=1024;cv.height=150;const c=cv.getContext('2d');
    c.fillStyle='rgba(250,251,247,.94)';c.beginPath();c.roundRect(1,1,1022,148,20);c.fill();
    c.fillStyle=color;c.fillRect(0,24,9,102);c.font='600 43px Segoe UI, sans-serif';c.textBaseline='middle';c.fillText(text,30,76,960);
    const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));s.position.set(x,y,z);s.scale.set(size,size*150/1024,1);s.renderOrder=6;this.group.add(s);return s;
  }
  line(points,color,closed=false){const obj=new (closed?THREE.LineLoop:THREE.Line)(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color,transparent:true,opacity:.9}));this.group.add(obj);return obj;}
  footprint(f,off,color){if(f.outline.length<3)return;
    const shape=new THREE.Shape(f.outline.map(p=>new THREE.Vector2(p[0]+off,-p[1])));
    const g=new THREE.ShapeGeometry(shape);g.rotateX(Math.PI/2);
    // Shape's second coordinate is world -Y; after rotation it becomes world Z.
    const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}));mesh.position.y=.018;this.group.add(mesh);
    this.line(f.outline.map(p=>[p[0]+off,.065,-p[1]]),color,true);
    this.label(`${f.area.toFixed(1)} m² · projected envelope`,(f.minX+f.maxX)/2+off,.22,-f.minY+.45,color,3.5);
  }
  height(f,off,color){const x=f.maxX+off+.5,z=-f.minY+.2,h=f.height;
    this.line([[x,0,z],[x,h,z]],color);for(const y of [0,h])this.line([[x-.25,y,z],[x+.25,y,z]],color);
    for(let y=1;y<h;y++)this.line([[x-.12,y,z],[x+.12,y,z]],color);
    this.label(`${h.toFixed(2)} m · height`,x+.4,h+.4,z,color,2.7);
  }
  material(f,off,color){const x=f.minX+off,z=-f.minY+1.7,L=10;
    let remaining=f.length,k=0;
    while(remaining>.001){const len=Math.min(L,remaining);const bar=new THREE.Mesh(new THREE.BoxGeometry(len,.065,.085),new THREE.MeshStandardMaterial({color,roughness:.85}));bar.position.set(x+len/2,.08,z+k*.145);bar.castShadow=true;this.group.add(bar);remaining-=len;k++;}
    this.label(`${f.length.toFixed(1)} m · ${f.count} members · ${f.volume.toFixed(2)} m³`,x+5,.5,z+k*.145+.5,color,4.7);
  }
  tiles(diff,off,mode){
    const pos=[],colors=[],indices=[],gain=new THREE.Color(C.gain),loss=new THREE.Color(C.loss),neutral=new THREE.Color(C.neutral);
    let n=0;
    for(const t of diff.tiles){
      const changed=Math.abs(t.delta)>.001;if(!changed&&(mode==='overlay'||this.onlyChanged))continue;
      const c=changed?(t.delta>0?gain:loss):neutral,a=changed?Math.min(.88,.35+Math.abs(t.delta)*.6):.12;
      const x=t.x+off,z=-t.y,h=t.step*.47;
      pos.push(x-h,.105,z-h,x+h,.105,z-h,x+h,.105,z+h,x-h,.105,z+h);
      for(let i=0;i<4;i++)colors.push(c.r,c.g,c.b,a);
      indices.push(n*4,n*4+2,n*4+1,n*4,n*4+3,n*4+2);n++;
    }
    if(!n)return;
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));geo.setIndex(indices);
    this.group.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,side:THREE.DoubleSide,depthWrite:false})));
  }
  update(f,{mode='beside',focus='all',offset=13,local=false,localBox=null,titleA='Current',titleB='Reference',showShadeTiles=true,onlyChanged=false}={}){this.onlyChanged=onlyChanged;
    this.clear();this.facts=f;const pairs=[[f.A,0,C.current,titleA,'A'],...(mode==='single'?[]:[[f.B,mode==='beside'?offset:0,C.reference,titleB,'B']])];
    for(const [g,off,color,title,key] of pairs){
      if(mode!=='overlay')this.label(`${key} / ${title}`,(g.minX+g.maxX)/2+off,g.height+1.2,-(g.minY+g.maxY)/2,color,4.1);
      if(focus==='all'||focus==='area')this.footprint(g,off,color);
      if(focus==='all'||focus==='height')this.height(g,off+(mode==='overlay'&&key==='B'?-.55:0),color);
      if(focus==='material')this.material(g,off+(mode==='overlay'&&key==='B'?0:0),color);
    }
    if(showShadeTiles&&(focus==='shade'||focus==='all')){
      if(mode==='overlay')this.tiles(f.shade,0,mode);
      else if(mode==='beside'){
        // Identical signed marks on both sites establish correspondence, not two unrelated heat maps.
        this.tiles(f.shade,0,mode);this.tiles(f.shade,offset,mode);
      }
    }
    if(mode==='overlay'&&focus==='material'){
      // Keep the timber strips legible by putting B behind A; the assemblies remain overlaid.
      this.clear();this.material(f.A,0,C.current);const before=this.group.children.length;this.material(f.B,0,C.reference);
      const dz=Math.ceil(f.A.length/10)*.145+1.3;this.group.children.slice(before).forEach(o=>{o.position.z+=dz;});
    }
    if(mode==='overlay'&&local&&localBox){const b=localBox;
      const h=Math.max(f.A.height,f.B.height)+.3,geo=new THREE.BoxGeometry(b.x1-b.x0,h,b.y1-b.y0),box=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineDashedMaterial({color:C.reference,dashSize:.15,gapSize:.09}));geo.dispose();
      box.position.set((b.x0+b.x1)/2,h/2,-(b.y0+b.y1)/2);box.computeLineDistances();this.group.add(box);
      this.label('Local overlap · fixed ground coordinates',(b.x0+b.x1)/2,h+.4,-(b.y0+b.y1)/2,C.reference,3.8);
    }
    this.group.userData={mode,focus,offset,local,tiles:f.shade.tiles.length};
  }
}
