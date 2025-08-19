'use strict';

const $ = sel => document.querySelector(sel);
const fileInput = $('#file');
const convertBtn = $('#convert');
const downloadBtn = $('#download');
const unitsSel = $('#units');
const inclLinesEl = $('#inclLines');
const extrudePolysEl = $('#extrudePolys');
const extrudeLinesEl = $('#extrudeLines');
const depthEl = $('#depth');
const lineWEl = $('#lineW');
const logEl = $('#log'), unitsChip = $('#unitsChip'), facesChip = $('#facesChip'), linesChip = $('#linesChip');
const viewer = $('#viewer');

let lastDXFText = null;
let lastGLBBlobUrl = null;

fileInput.addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  if(!f){ convertBtn.disabled = true; return; }
  try {
    lastDXFText = await f.text();
    convertBtn.disabled = false;
    log('DXF listo: ' + f.name);
  } catch (err) {
    log('No se pudo leer el archivo: ' + err.message);
  }
});




convertBtn.addEventListener('click', async ()=>{
  const opts = {
    unitMode: unitsSel.value,
    includeLines: inclLinesEl.checked,
    extrudePolys: extrudePolysEl.checked,
    extrudeLines: extrudeLinesEl.checked,
    depth: Math.max(0.0001, parseFloat(depthEl.value)||0.1),
    lineWidth: Math.max(0.0001, parseFloat(lineWEl.value)||0.02)
  };

  // Obtener el DXF actual: usar lastDXFText si existe; si no, leer del input (primer archivo)
  let dxfText = (typeof lastDXFText !== 'undefined' && lastDXFText) ? lastDXFText : '';
  if (!dxfText && typeof fileInput !== 'undefined' && fileInput && fileInput.files && fileInput.files[0]){
    dxfText = await fileInput.files[0].text();
  }
  if (!dxfText){ log('Selecciona un DXF antes de convertir.'); return; }

  try {
    const r = parseAndBuild(dxfText, opts);
    const faces = (r && r.triangles) ? r.triangles.length : 0;
    const lines = (r && r.segments)  ? r.segments.length  : 0;
    try {
      if (r && r.scaleApplied!=null){
        unitsChip.textContent = 'Unidad: ' + r.scaleApplied.toFixed(6) + ' m/u';
      }
      facesChip.textContent = 'Caras: ' + faces;
      linesChip.textContent = 'Líneas: ' + lines;
    } catch(e){}

    const blob = buildGLB(r ? r.triangles : [], opts.includeLines && r ? r.segments : []);
    downloadBtn.disabled = false;
    downloadBtn.onclick = ()=> download(blob, 'model.glb');
    if (lastGLBBlobUrl) URL.revokeObjectURL(lastGLBBlobUrl);
    lastGLBBlobUrl = URL.createObjectURL(blob);
    try {
      viewer.src = lastGLBBlobUrl;
      log('GLB cargado en visor.');
    } catch (e) {
      log('GLB generado. (No se pudo cargar en el visor.)');
    }
  } catch (err) {
    log('Error al generar GLB: ' + (err && err.message ? err.message : err));
  }
});




function log(msg){ logEl.textContent += msg + '\n'; logEl.scrollTop = logEl.scrollHeight; }

function parseAndBuild(text, {unitMode, includeLines, extrudePolys, extrudeLines, depth, lineWidth}){
  const lines = text.split(/\r?\n/);
  function getScaleFromUnits(mode, ins){
    if(mode !== 'auto'){
      if(mode==='mm') return 0.001;
      if(mode==='cm') return 0.01;
      if(mode==='m')  return 1.0;
      if(mode==='in') return 0.0254;
      if(mode==='ft') return 0.3048;
    }
    const lut = {0:1.0,1:0.0254,2:0.3048,3:0.9144,4:0.001,5:0.01,6:1.0,7:1000.0,9:0.0000254,10:1.0};
    if(ins != null && (ins in lut)) return lut[ins];
    return 0.001; // default mm->m
  }

  // Find INSUNITS
  let insunits = null;
  for(let i=0;i<lines.length-1;i+=2){
    const c = lines[i].trim(), v = lines[i+1].trim();
    if(c==='0' && v==='SECTION' && i+4<lines.length && lines[i+2].trim()==='2' && lines[i+3].trim()==='HEADER'){
      for(let j=i+4;j<lines.length-1;j+=2){
        const cc = lines[j].trim(), vv = lines[j+1].trim();
        if(cc==='0' && vv==='ENDSEC') { i=j; break; }
        if(cc==='9' && vv==='$INSUNITS'){
          if(j+4<lines.length && lines[j+2].trim()==='70'){
            const n = parseInt(lines[j+3].trim(), 10);
            if(!isNaN(n)) insunits = n;
          }
        }
      }
    }
  }
  const scale = getScaleFromUnits(unitMode, insunits);

  // Parse entities
  const triangles = []; // [[x,y,z], [x,y,z], [x,y,z]]
  const segments  = []; // [[x,y,z], [x,y,z]]
  const polylines = []; // {verts:[[x,y,z]...], closed:bool}
  let inEnt = false;
  for(let i=0;i<lines.length-1;i+=2){
    const c = lines[i].trim(), v = lines[i+1].trim();
    if(c==='0' && v==='SECTION'){
      if(i+4<lines.length && lines[i+2].trim()==='2' && lines[i+3].trim()==='ENTITIES'){ inEnt = true; i += 2; continue; }
    }
    if(c==='0' && v==='ENDSEC'){ inEnt = false; continue; }
    if(!inEnt) continue;

    if(c==='0' && v==='3DFACE'){
      let x1,y1,z1,x2,y2,z2,x3,y3,z3,x4,y4,z4;
      for(let j=i+2;j<lines.length-1;j+=2){
        const cc=lines[j].trim(), vv=lines[j+1].trim();
        if(cc==='0') { i=j-2; break; }
        if(cc==='10') x1=parseFloat(vv);
        else if(cc==='20') y1=parseFloat(vv);
        else if(cc==='30') z1=parseFloat(vv);
        else if(cc==='11') x2=parseFloat(vv);
        else if(cc==='21') y2=parseFloat(vv);
        else if(cc==='31') z2=parseFloat(vv);
        else if(cc==='12') x3=parseFloat(vv);
        else if(cc==='22') y3=parseFloat(vv);
        else if(cc==='32') z3=parseFloat(vv);
        else if(cc==='13') x4=parseFloat(vv);
        else if(cc==='23') y4=parseFloat(vv);
        else if(cc==='33') z4=parseFloat(vv);
      }
      if([x1,y1,z1,x2,y2,z2,x3,y3,z3].every(n => typeof n === 'number')){
        const v0=[x1*scale,y1*scale,z1*scale], v1=[x2*scale,y2*scale,z2*scale], v2=[x3*scale,y3*scale,z3*scale];
        if([x4,y4,z4].every(n => typeof n === 'number')){
          const v3=[x4*scale,y4*scale,z4*scale];
          const same = (Math.abs(v3[0]-v2[0])<1e-9 && Math.abs(v3[1]-v2[1])<1e-9 && Math.abs(v3[2]-v2[2])<1e-9);
          if(same){ triangles.push(v0,v1,v2); }
          else { triangles.push(v0,v1,v2, v0,v2,v3); }
        } else {
          triangles.push(v0,v1,v2);
        }
      }
      continue;
    }

    if(c==='0' && v==='LINE'){
      let x1=0,y1=0,z1=0,x2=0,y2=0,z2=0, j=i+2;
      for(;j<lines.length-1;j+=2){
        const cc=lines[j].trim(), vv=lines[j+1].trim();
        if(cc==='0') { i=j-2; break; }
        if(cc==='10') x1=parseFloat(vv);
        else if(cc==='20') y1=parseFloat(vv);
        else if(cc==='30') z1=parseFloat(vv);
        else if(cc==='11') x2=parseFloat(vv);
        else if(cc==='21') y2=parseFloat(vv);
        else if(cc==='31') z2=parseFloat(vv);
      }
      const a=[x1*scale,y1*scale,z1*scale], b=[x2*scale,y2*scale,z2*scale];
      segments.push([a,b]);
      continue;
    }

    if(c==='0' && (v==='LWPOLYLINE' || v==='POLYLINE')){
      const verts=[]; let closed=false;
      for(let j=i+2;j<lines.length-1;j+=2){
        const cc=lines[j].trim(), vv=lines[j+1].trim();
        if(cc==='0') { i=j-2; break; }
        if(cc==='10'){
          const x=parseFloat(vv);
          if(j+2<lines.length && lines[j+2].trim()==='20'){
            const y=parseFloat(lines[j+3].trim());
            verts.push([x*scale,y*scale,0]); j+=2;
          }
        }
        if(cc==='70'){
          const n=parseInt(vv,10);
          if(!Number.isNaN(n)) closed = !!(n & 1);
        }
      }
      polylines.push({verts, closed});
      continue;
    }
  }

  // Extruir polilíneas cerradas
  if(extrudePolys){
    let extruded = 0;
    for(const P of polylines){
      const vs = P.verts;
      if(!(P.closed && vs.length>=3)) continue;
      const tris = triangulatePolygon2D(vs);
      if(tris.length < 1) continue;
      // Build bottom/top + sides
      const z0 = 0, z1 = depth;
      // faces (top & bottom)
      for(const t of tris){
        const a=vs[t[0]], b=vs[t[1]], c=vs[t[2]];
        // bottom (CW to face -Z)
        triangles.push([a[0],a[1],z0],[c[0],c[1],z0],[b[0],b[1],z0]);
        // top (CCW to face +Z)
        triangles.push([a[0],a[1],z1],[b[0],b[1],z1],[c[0],c[1],z1]);
      }
      // sides
      for(let i=0;i<vs.length;i++){
        const j=(i+1)%vs.length;
        const A=vs[i], B=vs[j];
        triangles.push(
          [A[0],A[1],z0],[B[0],B[1],z0],[B[0],B[1],z1],
          [A[0],A[1],z0],[B[0],B[1],z1],[A[0],A[1],z1]
        );
      }
      extruded++;
    }
    if(extruded) log('Polilíneas extruidas: ' + extruded);
  }

  // Dar volumen a LINE (barras)
  if(extrudeLines){
    let count=0;
    for(const seg of segments){
      const A=seg[0], B=seg[1];
      const w = lineWidth;
      const d = depth;
      const vx=B[0]-A[0], vy=B[1]-A[1];
      const L=Math.hypot(vx,vy);
      if(L<1e-9) continue;
      const nx=-(vy/L)*(w/2), ny=(vx/L)*(w/2); // perpendicular en XY
      const z0=A[2], z1=z0 + d; // usa z del segmento y extruye en +Z
      // 4 esquinas base
      const p0=[A[0]-nx, A[1]-ny, z0], p1=[A[0]+nx, A[1]+ny, z0];
      const p2=[B[0]+nx, B[1]+ny, z0], p3=[B[0]-nx, B[1]-ny, z0];
      // 4 esquinas top
      const q0=[A[0]-nx, A[1]-ny, z1], q1=[A[0]+nx, A[1]+ny, z1];
      const q2=[B[0]+nx, B[1]+ny, z1], q3=[B[0]-nx, B[1]-ny, z1];
      // caras (12 triángulos)
      // bottom
      triangles.push(p0,p2,p1, p0,p3,p2);
      // top
      triangles.push(q0,q1,q2, q0,q2,q3);
      // lados
      triangles.push(p0,p1,q1, p0,q1,q0); // A side
      triangles.push(p1,p2,q2, p1,q2,q1); // long side
      triangles.push(p2,p3,q3, p2,q3,q2); // B side
      triangles.push(p3,p0,q0, p3,q0,q3); // long side 2
      count++;
    }
    if(count) log('LINE extruidas: ' + count);
  }

  return {triangles, segments, scaleApplied: scale};
}

// —————— triangulación polígono (ear clipping simple, 2D XY) ——————
function triangulatePolygon2D(vs){
  // Ensure CCW
  const n = vs.length;
  if(n < 3) return [];
  const verts = vs.map(v => [v[0], v[1]]);
  if (signedArea(verts) < 0) verts.reverse();

  const V = Array.from({length:n}, (_,i)=>i);
  const result = [];
  let guard = 0;
  while (V.length > 3 && guard++ < 10000){
    let earFound = false;
    for(let i=0;i<V.length;i++){
      const i0 = V[(i+V.length-1)%V.length];
      const i1 = V[i];
      const i2 = V[(i+1)%V.length];
      const a = verts[i0], b = verts[i1], c = verts[i2];
      if (!isConvex(a,b,c)) continue;
      // check if any other point inside triangle
      let contains = false;
      for (let j=0;j<V.length;j++){
        const vi = V[j];
        if (vi===i0||vi===i1||vi===i2) continue;
        if (pointInTri(verts[vi], a,b,c)){ contains = true; break; }
      }
      if (contains) continue;
      // ear!
      result.push([i0,i1,i2]);
      V.splice(i,1);
      earFound = true;
      break;
    }
    if(!earFound) break; // fallback
  }
  if (V.length === 3) result.push([V[0],V[1],V[2]]);
  return result;
}
function signedArea(vs){
  let a=0;
  for(let i=0;i<vs.length;i++){
    const j=(i+1)%vs.length;
    a += vs[i][0]*vs[j][1] - vs[j][0]*vs[i][1];
  }
  return a/2;
}
function isConvex(a,b,c){
  const cross = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
  return cross > 0; // CCW
}
function pointInTri(p, a,b,c){
  // barycentric
  const v0=[c[0]-a[0], c[1]-a[1]];
  const v1=[b[0]-a[0], b[1]-a[1]];
  const v2=[p[0]-a[0], p[1]-a[1]];
  const den = v0[0]*v1[1] - v1[0]*v0[1];
  if (Math.abs(den) < 1e-12) return false;
  const u = (v2[0]*v1[1] - v1[0]*v2[1]) / den;
  const v = (v0[0]*v2[1] - v2[0]*v0[1]) / den;
  return (u>=0 && v>=0 && (u+v)<=1);
}

// —————— GLB builder (igual que antes) ——————
function buildGLB(triangles, segments){
  // Weld vertices for triangles
  let triVerts = [];
  let triIdx = [];
  if(triangles && triangles.length){
    const map = new Map();
    function key(v){ return (Math.round(v[0]*1e6)/1e6)+','+(Math.round(v[1]*1e6)/1e6)+','+(Math.round(v[2]*1e6)/1e6); }
    for(let k=0;k<triangles.length;k+=3){
      const A=triangles[k], B=triangles[k+1], C=triangles[k+2];
      for(const v of [A,B,C]){
        const kk = key(v);
        if(!map.has(kk)){ map.set(kk, triVerts.length/3); triVerts.push(v[0],v[1],v[2]); }
      }
      triIdx.push(map.get(key(A)), map.get(key(B)), map.get(key(C)));
    }
    centerArrayInPlace(triVerts);
  }

  // Lines
  let lineVerts = [];
  let lineIdx = [];
  if(segments && segments.length){
    for(const [a,b] of segments){
      lineVerts.push(a[0],a[1],a[2], b[0],b[1],b[2]);
    }
    centerArrayInPlace(lineVerts);
    for(let i=0;i<lineVerts.length/3;i++){ lineIdx.push(i); }
  }

  if(!triVerts.length && !lineVerts.length){
    throw new Error('No se detectó geometría (3DFACE / LINES).');
  }

  const triPosBin = float32ToArrayBuffer(triVerts);
  const triIdxBin = uint32ToArrayBuffer(triIdx);
  const linePosBin= float32ToArrayBuffer(lineVerts);
  const lineIdxBin= uint32ToArrayBuffer(lineIdx);
  const binBlob   = concatBuffers([triPosBin, triIdxBin, linePosBin, lineIdxBin]);

  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const materials = [
    {"name":"DefaultMat","pbrMetallicRoughness":{"baseColorFactor":[0.8,0.82,0.85,1.0],"metallicFactor":0.0,"roughnessFactor":0.9},"doubleSided":true},
    {"name":"LineBlack","pbrMetallicRoughness":{"baseColorFactor":[0,0,0,1.0],"metallicFactor":0.0,"roughnessFactor":1.0},"doubleSided":true}
  ];

  let offset = 0;
  function addView(len, target){
    const view = {"buffer":0,"byteOffset":offset,"byteLength":len,"target":target};
    bufferViews.push(view);
    offset += len;
    return bufferViews.length-1;
  }
  function addAcc(view, compType, count, type, minv, maxv, byteOffset=0){
    const acc = {"bufferView":view,"byteOffset":byteOffset,"componentType":compType,"count":count,"type":type};
    if(minv) acc.min = minv;
    if(maxv) acc.max = maxv;
    accessors.push(acc);
    return accessors.length-1;
  }

  const meshNodes = [];
  if(triVerts.length && triIdx.length){
    const vp = addView(triPosBin.byteLength, 34962);
    const vi = addView(triIdxBin.byteLength, 34963);
    const xs = pickEvery(triVerts,0), ys = pickEvery(triVerts,1), zs = pickEvery(triVerts,2);
    const apos = addAcc(vp, 5126, triVerts.length/3, "VEC3", [min(xs),min(ys),min(zs)], [max(xs),max(ys),max(zs)]);
    const aidx = addAcc(vi, 5125, triIdx.length, "SCALAR", null, null);
    meshes.push({"primitives":[{"attributes":{"POSITION":apos},"indices":aidx,"mode":4,"material":0}]});
    meshNodes.push(meshes.length-1);
  }
  if(lineVerts.length && lineIdx.length){
    const vp = addView(linePosBin.byteLength, 34962);
    const vi = addView(lineIdxBin.byteLength, 34963);
    const xs = pickEvery(lineVerts,0), ys = pickEvery(lineVerts,1), zs = pickEvery(lineVerts,2);
    const apos = addAcc(vp, 5126, lineVerts.length/3, "VEC3", [min(xs),min(ys),min(zs)], [max(xs),max(ys),max(zs)]);
    const aidx = addAcc(vi, 5125, lineIdx.length, "SCALAR", null, null);
    meshes.push({"primitives":[{"attributes":{"POSITION":apos},"indices":aidx,"mode":1,"material":1}]});
    meshNodes.push(meshes.length-1);
  }

  const gltf = {
    "asset":{"version":"2.0","generator":"dxf2glb_extrude_viewer"},
    "buffers":[{"byteLength": binBlob.byteLength }],
    "bufferViews": bufferViews,
    "accessors": accessors,
    "materials": materials.slice(0, meshNodes.length>1 ? 2 : 1),
    "meshes": meshes,
    "nodes": meshNodes.map((i)=>({"mesh":i,"name":"DXF_"+i})),
    "scenes":[{"nodes": meshNodes.map((_,i)=>i)}],
    "scene": 0
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPadded = pad4(jsonBytes);
  const binPadded = pad4(new Uint8Array(binBlob));
  const totalLen = 12 + 8 + jsonPadded.byteLength + 8 + binPadded.byteLength;

  const glb = new ArrayBuffer(totalLen);
  const dv = new DataView(glb);
  let o = 0;
  dv.setUint32(o, 0x46546C67, true); o+=4; // 'glTF'
  dv.setUint32(o, 2, true); o+=4;        // version
  dv.setUint32(o, totalLen, true); o+=4; // length
  dv.setUint32(o, jsonPadded.byteLength, true); o+=4;
  dv.setUint8(o++, 0x4A); dv.setUint8(o++, 0x53); dv.setUint8(o++, 0x4F); dv.setUint8(o++, 0x4E); // 'JSON'
  new Uint8Array(glb, o, jsonPadded.byteLength).set(jsonPadded); o += jsonPadded.byteLength;
  dv.setUint32(o, binPadded.byteLength, true); o+=4;
  dv.setUint8(o++, 0x42); dv.setUint8(o++, 0x49); dv.setUint8(o++, 0x4E); dv.setUint8(o++, 0x00); // 'BIN\0'
  new Uint8Array(glb, o, binPadded.byteLength).set(binPadded); o += binPadded.byteLength;

  return new Blob([glb], {type:'model/gltf-binary'});
}

// ---------- helpers ----------
function centerArrayInPlace(arr){
  if(!arr.length) return;
  const xs = pickEvery(arr,0), ys = pickEvery(arr,1), zs = pickEvery(arr,2);
  const cx=(min(xs)+max(xs))/2, cy=(min(ys)+max(ys))/2, cz=(min(zs)+max(zs))/2;
  for(let i=0;i<arr.length;i+=3){ arr[i]-=cx; arr[i+1]-=cy; arr[i+2]-=cz; }
}
function pickEvery(arr, start){ const out=[]; for(let i=start;i<arr.length;i+=3) out.push(arr[i]); return out; }
function min(a){ let m=Infinity; for(const v of a) if(v<m) m=v; return m; }
function max(a){ let m=-Infinity; for(const v of a) if(v>m) m=v; return m; }

function float32ToArrayBuffer(nums){ const f = new Float32Array(nums.length); f.set(nums); return f.buffer; }
function uint32ToArrayBuffer(nums){ const u = new Uint32Array(nums.length); u.set(nums); return u.buffer; }
function concatBuffers(arr){ let total=0; for(const b of arr) total += b.byteLength; const out = new Uint8Array(total); let o=0; for(const b of arr){ out.set(new Uint8Array(b), o); o+=b.byteLength; } return out.buffer; }
function pad4(u8){ const pad = (4 - (u8.byteLength % 4)) % 4; if(pad===0) return u8; const out = new Uint8Array(u8.byteLength + pad); out.set(u8,0); for(let i=u8.byteLength;i<out.byteLength;i++) out[i]=0x20; return out; }

function download(blob, filename){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}


// === Opciones del visor (rotación al tocar, vistas, secciones) ===
(function(){
  const mv = document.querySelector('#viewer');
  if (!mv) return;
  // 1) Detener auto-rotación al interactuar
  ['pointerdown','touchstart','mousedown','wheel','keydown'].forEach(evt => {
    mv.addEventListener(evt, ()=>{ if(mv.hasAttribute('auto-rotate')) mv.removeAttribute('auto-rotate'); }, {passive:true});
  });

  // 2) Vistas predefinidas (usa camera-orbit de <model-viewer>)
  const viewPreset = document.getElementById('viewPreset');
  if (viewPreset){
    viewPreset.addEventListener('change', ()=>{
      const val = viewPreset.value;
      // camera-orbit: azimuth polar radius (porcentaje del tamaño del modelo)
      if (val==='top') mv.setAttribute('camera-orbit', `0deg 90deg 100%`);
      else if (val==='front') mv.setAttribute('camera-orbit', `0deg 0deg 100%`);
      else if (val==='right') mv.setAttribute('camera-orbit', `90deg 0deg 100%`);
      else mv.setAttribute('camera-orbit', `-30deg 15deg 110%`); // isométrica por defecto
    });
  }

  // 3) Modo Sección (usa visor avanzado Three.js para clipping)
  const sectionMode = document.getElementById('sectionMode');
  const sectionControls = document.getElementById('sectionControls');
  const sectionAxis = document.getElementById('sectionAxis');
  const sectionPos = document.getElementById('sectionPos');
  const exitBtn = document.getElementById('exitSection');

  // Crear visor avanzado Three.js
  import('./libs/three/three.module.min.js').then(THREE=>{
    // loaders y controles
    import('./libs/three/examples/jsm/loaders/GLTFLoader.js').then(modLoader=>{
      const GLTFLoader = modLoader.GLTFLoader;
      import('./libs/three/examples/jsm/controls/OrbitControls.js').then(modCtrl=>{
        const OrbitControls = modCtrl.OrbitControls;

        const adv = document.getElementById('advancedViewer');
        const canvas = document.getElementById('advCanvas');
        const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(adv.clientWidth, adv.clientHeight);
        renderer.localClippingEnabled = true;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0d13);
        const camera = new THREE.PerspectiveCamera(60, adv.clientWidth/adv.clientHeight, 0.01, 10000);
        camera.position.set(6,6,6);
        const controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;

        const amb = new THREE.AmbientLight(0xffffff, .35);
        const d1 = new THREE.DirectionalLight(0xffffff, .9); d1.position.set(3,6,4);
        const d2 = new THREE.DirectionalLight(0xffffff, .6); d2.position.set(-4,5,-2);
        scene.add(amb,d1,d2);

        const grid = new THREE.GridHelper(100, 100, 0x334455, 0x223344);
        grid.material.transparent = true; grid.material.opacity = 0.25;
        scene.add(grid);

        const group = new THREE.Group(); scene.add(group);

        let clipPlane = new THREE.Plane(new THREE.Vector3(0,0,1), 0); // Z por defecto
        renderer.clippingPlanes = [clipPlane];

        function fitView(obj){
          const box = new THREE.Box3().setFromObject(obj);
          const size = new THREE.Vector3(); box.getSize(size);
          const center = new THREE.Vector3(); box.getCenter(center);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const fov = camera.fov * Math.PI/180;
          let dist = maxDim / (2*Math.tan(fov/2));
          dist *= 1.3;
          camera.position.set(center.x + dist, center.y + dist, center.z + dist);
          camera.lookAt(center);
          controls.target.copy(center);
          controls.update();
          // Ajustar rango del slider a caja del modelo
          sectionPos.min = Math.floor(-maxDim);
          sectionPos.max = Math.ceil(maxDim);
          sectionPos.value = "0";
        }

        function setAxis(axis){
          if (axis==='x') clipPlane = new THREE.Plane(new THREE.Vector3(1,0,0), 0);
          else if (axis==='y') clipPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
          else clipPlane = new THREE.Plane(new THREE.Vector3(0,0,1), 0);
          renderer.clippingPlanes = [clipPlane];
        }

        function setPosition(v){
          // Plane equation: normal.dot(point) - constant = 0; three uses .constant with opposite sign convention
          clipPlane.constant = -parseFloat(v||"0");
        }

        function animate(){
          requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        }
        animate();

        function onResize(){
          const w = adv.clientWidth, h = adv.clientHeight;
          renderer.setSize(w,h); camera.aspect = w/h; camera.updateProjectionMatrix();
        }
        window.addEventListener('resize', onResize);

        // Cargar GLB desde el <model-viewer> si existe, o cuando se genere uno nuevo
        async function loadFromModelViewer(){
          // Intenta obtener el blob actual desde src de model-viewer si es blob:url
          const src = mv.getAttribute('src') || '';
          if (src.startsWith('blob:')){
            try{
              const data = await fetch(src).then(r=>r.arrayBuffer());
              const blob = new Blob([data], {type:'model/gltf-binary'});
              const url = URL.createObjectURL(blob);
              return new Promise((resolve, reject)=>{
                new GLTFLoader().load(url, (gltf)=>{
                  // limpiar grupo
                  while(group.children.length) group.remove(group.children.pop());
                  group.add(gltf.scene);
                  fitView(group);
                  URL.revokeObjectURL(url);
                  resolve();
                }, undefined, reject);
              });
            }catch(e){ console.warn('No se pudo leer blob GLB del visor:', e); }
          }
          throw new Error('No hay GLB disponible en el visor. Genera GLB primero.');
        }

        // UI events
        if (sectionMode){
          sectionMode.addEventListener('change', async ()=>{
            if (sectionMode.checked){
              // Mostrar controles y visor avanzado, ocultar model-viewer
              sectionControls.style.display = 'inline-flex';
              const host = mv.parentElement;
              // el contenedor avanzado ocupa el mismo espacio (position:absolute; inset:0) dentro del host
              document.getElementById('advancedViewer').style.display = 'block';
              mv.style.visibility = 'hidden';
              try{
                await loadFromModelViewer();
              }catch(e){
                alert(e.message || e);
                // revertir estado
                sectionMode.checked = false;
                sectionControls.style.display = 'none';
                document.getElementById('advancedViewer').style.display = 'none';
                mv.style.visibility = '';
              }
            } else {
              sectionControls.style.display = 'none';
              document.getElementById('advancedViewer').style.display = 'none';
              mv.style.visibility = '';
            }
          });
        }

        if (sectionAxis){
          sectionAxis.addEventListener('change', ()=> setAxis(sectionAxis.value));
        }
        if (sectionPos){
          sectionPos.addEventListener('input', ()=> setPosition(sectionPos.value));
        }
        if (exitBtn){
          exitBtn.addEventListener('click', ()=>{
            sectionMode.checked = false;
            sectionMode.dispatchEvent(new Event('change'));
          });
        }
      });
    });
  });
})();


// === Collapsible Aside / Drawer ===
(function(){
  const toggle = document.getElementById('toggleAside');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('asideBackdrop');
  if (!toggle || !sidebar) return;

  function isMobile(){ return window.matchMedia('(max-width: 980px)').matches; }

  function openDrawer(){
    document.body.classList.add('drawer-open');
    toggle.setAttribute('aria-expanded', 'true');
    if (backdrop) backdrop.hidden = false;
  }
  function closeDrawer(){
    document.body.classList.remove('drawer-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (backdrop) backdrop.hidden = true;
  }
  function toggleAside(){
    if (isMobile()){
      if (document.body.classList.contains('drawer-open')) closeDrawer();
      else openDrawer();
    } else {
      const collapsed = document.body.classList.toggle('aside-collapsed');
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
  }

  toggle.addEventListener('click', toggleAside);
  if (backdrop){
    backdrop.addEventListener('click', closeDrawer);
  }
  window.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') closeDrawer();
  });
})();



// === Aside: convertir secciones en desplegables (ACCORDION) y estado de procesos ===
(function(){
  const aside = document.querySelector('aside');
  if (!aside) return;
  const secs = Array.from(aside.querySelectorAll('section'));

  // Helper: wrap <h2> into header with caret
  function wrapHeader(sec){
    let h2 = sec.querySelector(':scope > h2');
    if (!h2) return null;
    const header = document.createElement('div');
    header.className = 'sec-header';
    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.textContent = '▶';
    header.appendChild(h2.cloneNode(true));
    header.appendChild(caret);
    h2.replaceWith(header);
    return header;
  }
  function buildBody(sec){
    const body = document.createElement('div');
    body.className = 'sec-body';
    const nodes = Array.from(sec.childNodes);
    nodes.forEach(n=>{ if(!(n.nodeType===1 && n.classList && n.classList.contains('sec-header'))) body.appendChild(n); });
    sec.appendChild(body);
    return body;
  }
  function setOpen(sec, open){
    sec.classList.toggle('sec-open', open);
    sec.classList.toggle('sec-closed', !open);
    const hh = sec.querySelector(':scope > .sec-header');
    if (hh) hh.setAttribute('aria-expanded', String(open));
  }
  function closeOthers(except){
    secs.forEach(s=>{
      if (s!==except && !s.classList.contains('sec-locked')){
        setOpen(s, false);
      }
    });
  }

  // Build
  secs.forEach(sec=>{
    const isRegistro = !!sec.querySelector('#log') || /log/i.test((sec.querySelector('h2')||{}).textContent||'');
    const header = wrapHeader(sec);
    const body = buildBody(sec);

    if (isRegistro){
      sec.classList.add('sec-locked');
      setOpen(sec, true); // always visible
      // Status list (if missing)
      if (!sec.querySelector('#statusList')){
        const ul = document.createElement('ul');
        ul.id = 'statusList';
        ul.className = 'status-list';
        ul.innerHTML = `
          <li data-step="dxf"><span class="badge s-pending">Pendiente</span> Archivo DXF</li>
          <li data-step="modelo"><span class="badge s-pending">Pendiente</span> Modelo generado</li>
          <li data-step="glb"><span class="badge s-pending">Pendiente</span> GLB exportado</li>
          <li data-step="descarga"><span class="badge s-pending">Pendiente</span> Descarga</li>
        `;
        body.prepend(ul);
      }
    } else {
      setOpen(sec, false); // start closed
      if (header){
        header.setAttribute('role','button');
        header.setAttribute('tabindex','0');
        header.setAttribute('aria-expanded','false');
        header.addEventListener('click', ()=>{
          const willOpen = !sec.classList.contains('sec-open');
          if (willOpen) closeOthers(sec);
          setOpen(sec, willOpen);
        });
        header.addEventListener('keydown', (e)=>{
          if (e.key==='Enter' || e.key===' '){
            e.preventDefault();
            const willOpen = !sec.classList.contains('sec-open');
            if (willOpen) closeOthers(sec);
            setOpen(sec, willOpen);
          }
        });
      }
    }
  });

  // --- Estado de procesos ---
  function statusSet(step, state){
    const el = aside.querySelector(`#statusList li[data-step="${step}"] .badge`);
    if (!el) return;
    el.classList.remove('s-pending','s-running','s-ok','s-error');
    if (state==='running'){ el.classList.add('s-running'); el.textContent='En proceso'; }
    else if (state==='ok'){ el.classList.add('s-ok'); el.textContent='OK'; }
    else if (state==='error'){ el.classList.add('s-error'); el.textContent='Error'; }
    else { el.classList.add('s-pending'); el.textContent='Pendiente'; }
  }
  window.__statusSet = statusSet;

  // Integración con la UI existente
  const fileInput   = document.querySelector('#file');
  const exportBtn   = document.querySelector('#export') || document.querySelector('#convert');
  const downloadBtn = document.querySelector('#download');

  if (fileInput){
    fileInput.addEventListener('change', ()=>{
      if (fileInput.files && fileInput.files.length) statusSet('dxf','ok');
      else statusSet('dxf','pending');
    });
  }
  if (exportBtn){
    const obs = new MutationObserver(()=>{
      if (!exportBtn.disabled){ statusSet('modelo','ok'); } else { statusSet('modelo','pending'); }
    });
    obs.observe(exportBtn, { attributes:true, attributeFilter:['disabled'] });
  }
  if (downloadBtn){
    const obs2 = new MutationObserver(()=>{
      if (!downloadBtn.disabled){ statusSet('glb','ok'); } else { statusSet('glb','pending'); }
    });
    obs2.observe(downloadBtn, { attributes:true, attributeFilter:['disabled'] });
    downloadBtn.addEventListener('click', ()=> statusSet('descarga','ok'));
  }

  window.addEventListener('error', ()=> statusSet('modelo','error'));
  window.addEventListener('unhandledrejection', ()=> statusSet('glb','error'));
})();


// === Mobile viewer activation ===
(function(){
  const mq = window.matchMedia('(max-width: 980px)');
  function markReady(){ document.body.classList.add('viewer-ready'); }
  // If mobile on load, ensure starts hidden (no 'viewer-ready')
  document.addEventListener('DOMContentLoaded', ()=>{ if (mq.matches) document.body.classList.remove('viewer-ready'); });

  const mv = document.querySelector('#viewer');
  if (mv){
    // If already has src at load
    if (mv.getAttribute('src')) markReady();
    // Watch for src changes
    const obs = new MutationObserver((muts)=>{
      for (const m of muts){
        if (m.attributeName === 'src'){
          const s = mv.getAttribute('src') || '';
          if (s.length) markReady();
        }
      }
    });
    obs.observe(mv, { attributes:true, attributeFilter:['src'] });
  }

  // When GLB export enables download, consider ready (even si no hay preview)
  const downloadBtn = document.querySelector('#download');
  if (downloadBtn){
    const obs2 = new MutationObserver(()=>{
      if (!downloadBtn.disabled) markReady();
    });
    obs2.observe(downloadBtn, { attributes:true, attributeFilter:['disabled'] });
  }

  // If Section mode is turned on, also reveal
  const sectionMode = document.getElementById('sectionMode');
  if (sectionMode){
    sectionMode.addEventListener('change', ()=>{ if (sectionMode.checked) markReady(); });
  }

  // Custom global event hook (optional)
  window.addEventListener('viewer-ready', markReady);
})();


// === Pre-import classification (Tajos / Avances / Proyecto) ===
(function(){
  const group = document.getElementById('preTypeGroup');
  const fileInput = document.getElementById('file');
  if (!group || !fileInput) return;
  const radios = Array.from(group.querySelectorAll('input[name="preType"]'));

  function selected(){ const r = radios.find(x=>x.checked); return r ? r.value : ''; }

  function updateRegistro(){
    if (!window.__statusSet) return;
    const aside = document.querySelector('aside');
    const ul = aside && aside.querySelector('#statusList');
    if (ul && !ul.querySelector('li[data-step="tipo"]')){
      const li = document.createElement('li');
      li.setAttribute('data-step','tipo');
      li.innerHTML = '<span class="badge s-pending">Pendiente</span> Tipo: —';
      ul.insertBefore(li, ul.firstChild.nextSibling);
    }
    const badge = document.querySelector('#statusList li[data-step="tipo"] .badge');
    if (!badge) return;
    const val = selected();
    if (val){
      badge.className = 'badge s-ok';
      badge.textContent = 'OK';
      const li = badge.parentElement;
      li.childNodes[li.childNodes.length-1].textContent = ' Tipo: ' + (val==='tajos'?'Tajos': val==='avances'?'Avances':'Proyecto');
      document.body.dataset.dxfType = val;
    } else {
      badge.className = 'badge s-pending';
      badge.textContent = 'Pendiente';
      document.body.dataset.dxfType = '';
    }
  }

  function onChange(){
    const val = selected();
    // enable/disable file input
    fileInput.disabled = !val;
    updateRegistro();
  }
  radios.forEach(r=> r.addEventListener('change', onChange));
  // initialize
  onChange();
})();


