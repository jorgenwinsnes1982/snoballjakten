/* SnowFX Extreme – materials for everything that is not snow, dressing of the world, backdrops, scarf. */
(() => {
  const NS = window.SNOWFX = window.SNOWFX || {};

  /* smooth deterministic value noise for geometry (never touches the game's random stream) */
  const hh = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vn = NS.vnoise = (x, y) => { const X = Math.floor(x), Y = Math.floor(y), a = x - X, b = y - Y, u = a * a * (3 - 2 * a), v = b * b * (3 - 2 * b); const p = hh(X, Y), q = hh(X + 1, Y), r = hh(X, Y + 1), s = hh(X + 1, Y + 1); return p + (q - p) * u + (r - p) * v + (p - q - r + s) * u * v; };
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  /* drifts: snow piled up beside the track. Visual only – colliders, riding height and placement use the game's own gY. */
  NS.drift = (u, z, hw, sh) => { const a = Math.abs(u) - hw - 2.1; if (a <= 0) return 0; const k = ss(0, 3.5, a) * (1 - Math.min(1, Math.abs(sh) * 2)); if (k <= 0) return 0; return k * (vn(u * .23 + 40, z * .13) * .40 + Math.pow(1 - Math.abs(vn(u * .11 - 9, z * .21) * 2 - 1), 3) * .34 + ss(9, 30, a) * (vn(u * .07, z * .07) - .35) * 1.5); };

  const VW = sh => { sh.vertexShader = 'varying vec3 vWP,vWN,vLP;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vWN=mat3(modelMatrix)*objectNormal;').replace('#include <project_vertex>', '#include <project_vertex>\n { vec4 wq=vec4(transformed,1.);\n#ifdef USE_INSTANCING\n wq=instanceMatrix*wq; vWN=mat3(modelMatrix)*(mat3(instanceMatrix)*objectNormal);\n#endif\n vWP=(modelMatrix*wq).xyz; vLP=position; }'); };
  const HEAD = `uniform sampler2D uNz; uniform vec3 uKeyC,uSkyC,uKeyD; uniform float uSnowK,uT; varying vec3 vWP,vWN,vLP;
    vec4 sfxTri(vec3 p,vec3 n,float s){ vec3 w=pow(abs(n),vec3(4.)); w/=w.x+w.y+w.z; return texture2D(uNz,p.zy*s)*w.x+texture2D(uNz,p.xz*s)*w.y+texture2D(uNz,p.xy*s)*w.z; }
    float sfxS,sfxGl; vec3 sfxWN;\n`;
  const RIM = `outgoingLight+=uSkyC*rim*.34+uKeyC*pow(clamp(dot(-normalize(cameraPosition-vWP),uKeyD),0.,1.),2.)*rim*.5;`;

  NS.createWorld = ctx => {
    const { THREE, renderer, scene, camera, noiseTex, snow, wpos, gY, cx, cy, halfW, spH, NCH, CH, glowTex, FOG, merge, paint, P_, vcMat } = ctx;
    const W = { on: false, s: null, kinds: [], U: { uNz: { value: noiseTex }, uKeyC: snow.U.uKeyC, uSkyC: snow.U.uSkyC, uKeyD: snow.U.uKeyD, uSnowK: { value: 0 }, uT: snow.U.uT, uWind: { value: new THREE.Vector3(1, 0, .3) } } };
    const add = (sh, body) => Object.assign(sh.uniforms, W.U);

    /* snow settles on whatever faces up; noise breaks the edge */
    W.compileStatic = (sh, house) => {
      add(sh); VW(sh);
      if (house) { sh.vertexShader = 'attribute vec3 aB; varying vec3 vB;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vB=aB;'); }
      sh.fragmentShader = HEAD + (house ? 'varying vec3 vB;\n' : '') + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 wn=normalize(vWN); vec3 rgb0=diffuseColor.rgb; vec4 t=sfxTri(vWP,wn,.55), f=sfxTri(vWP,wn,2.3); float white=smoothstep(.62,.8,min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b)));
          vec2 g=(t.ba-.5)*.35+(f.ba-.5)*.5; float rough=roughnessFactor;
          ${house ? `
          int kd=int(vB.z+.5); vec2 q=vB.xy; float ax=max(fwidth(q.x),fwidth(q.y)); float lod=1.-smoothstep(.02,.09,ax);
          if(kd==1){ vec2 bs=vec2(.46,.19); float row=floor(q.y/bs.y); vec2 c=vec2(q.x/bs.x+mod(row,2.)*.5,q.y/bs.y); vec2 id=floor(c), k=abs(fract(c)-.5); float h=fract(sin(dot(id,vec2(127.1,311.7)))*43758.5); float mort=max(smoothstep(.43,.485,k.x),smoothstep(.36,.46,k.y)); vec3 br=diffuseColor.rgb*(.72+.62*h)*(.85+.3*f.r)*1.35; diffuseColor.rgb=mix(br,vec3(.20,.18,.19),mort*lod*.85); g+=vec2(0.,(fract(c.y)-.5)*-.35)*lod*(1.-mort); rough=.92; float ws=smoothstep(.70,.86,t.g*.5+f.r*.5+(1.-k.y)*.12)*.55; diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.8,.85,.93),ws*lod*.7); }
          else if(kd==2){ float c=q.x/.21; float id=floor(c), k=abs(fract(c)-.5); float h=fract(sin(id*91.7)*4375.5); vec4 gr=texture2D(uNz,vec2(q.x*2.2+h*7.,q.y*.16)); diffuseColor.rgb*=(.75+.4*h)*(.7+.6*gr.r)*1.25; diffuseColor.rgb*=1.-.55*smoothstep(.43,.5,k)*lod; g.x+=(fract(c)-.5)*.35*lod+(gr.b-.5)*.8; rough=.8; }
          else if(kd==3){ diffuseColor.rgb*=.86+.24*t.r; g+=(f.ba-.5)*.5; rough=.95; }
          else if(kd==4){ vec2 c=q/vec2(.62,.4); c.x+=mod(floor(c.y),2.)*.5; vec2 id=floor(c),k=abs(fract(c)-.5); float h=fract(sin(dot(id,vec2(27.1,61.7)))*4758.5); diffuseColor.rgb*=.7+.6*h; diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12),max(smoothstep(.42,.5,k.x),smoothstep(.4,.5,k.y))*lod*.7); rough=.9; }` : `
          { vec4 gr=texture2D(uNz,vec2(dot(vWP,vec3(.9,.2,.4))*.5,dot(vWP,vec3(.1,3.1,.3))*.7)); diffuseColor.rgb*=mix(.78+.44*gr.r,1.,white); rough=mix(rough+.1*(gr.g-.5),rough,white); }`}
          float up=wn.y+(t.r-.5)*.55+(f.g-.5)*.3; sfxS=smoothstep(.52,.80,up)*(1.-white); float s2=max(sfxS,white);
          vec3 sc=vec3(.86,.895,.955)*(.9+.14*t.r); sfxGl=${house ? '0.' : '1.-smoothstep(.0015,.004,distance(rgb0,vec3(.0252,.0232,.0194)))'}; diffuseColor.rgb=mix(diffuseColor.rgb,sc,s2*(1.-sfxGl)); rough=mix(rough,.88,s2); roughnessFactor=clamp(rough,.2,1.);
          vec3 tu=normalize(abs(wn.y)<.9?cross(vec3(0.,1.,0.),wn):vec3(1.,0.,0.)), tv=cross(wn,tu); sfxWN=normalize(wn-(tu*g.x+tv*g.y)*mix(.8,.75,s2)); normal=normalize((viewMatrix*vec4(sfxWN,0.)).xyz); sfxS=s2; }`)
        .replace('#include <opaque_fragment>', `{ vec3 V=normalize(cameraPosition-vWP); float nv=clamp(dot(sfxWN,V),0.,1.); float rim=pow(1.-nv,3.5); ${RIM} float wrap=clamp((dot(sfxWN,uKeyD)+.45)/1.45,0.,1.); outgoingLight+=diffuseColor.rgb*uKeyC*vec3(.24,.36,.7)*wrap*wrap*.07*sfxS; outgoingLight+=vec3(3.4,1.75,.62)*sfxGl*(.75+.25*clamp(dot(sfxWN,V),0.,1.)); }
        #include <opaque_fragment>`);
    };
    /* cloth, painted wood and props that move: soft fuzz at grazing angles, a fine weave, snow on the shoulders of people who have been out a while */
    W.compileCloth = (sh, o = {}) => {
      add(sh); VW(sh);
      sh.fragmentShader = HEAD + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 wn=normalize(vWN); vec3 ln=normalize(cross(dFdx(vLP),dFdy(vLP))+1e-6); vec4 t=sfxTri(vLP,ln,${o.s1 || '1.6'}), f=sfxTri(vLP,ln,${o.s2 || '7.0'}); float dist=length(vWP-cameraPosition); float near=1.-smoothstep(8.,28.,dist);
          vec2 g=((t.ba-.5)*.35+(f.ba-.5)*${o.weave || '.7'})*near; vec3 tu=normalize(abs(wn.y)<.9?cross(vec3(0.,1.,0.),wn):vec3(1.,0.,0.)),tv=cross(wn,tu);
          diffuseColor.rgb*=.86+.28*f.r*near+.14*(1.-near); roughnessFactor=clamp(roughnessFactor+(t.g-.5)*.22,.25,1.);
          float up=wn.y+(t.r-.5)*.5+(f.g-.5)*.4; sfxS=smoothstep(.62,.92,up)*${o.snow || 'uSnowK*.55'}; diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.88,.91,.96),sfxS); ${o.rime ? 'float ri=smoothstep(.55,.75,f.g+t.r*.3)*smoothstep(-.2,.5,wn.y)*uSnowK*.45; diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.85,.95),ri); roughnessFactor=mix(roughnessFactor,.5,ri);' : ''}
          sfxWN=normalize(wn-(tu*g.x+tv*g.y)*.8); normal=normalize((viewMatrix*vec4(sfxWN,0.)).xyz)*${o.ds ? '(gl_FrontFacing?1.:-1.)' : '1.'}; }`)
        .replace('#include <opaque_fragment>', `{ vec3 V=normalize(cameraPosition-vWP); float nv=clamp(abs(dot(sfxWN,V)),0.,1.); float rim=pow(1.-nv,3.); ${RIM} outgoingLight+=diffuseColor.rgb*(uSkyC*.5+uKeyC*.18)*pow(1.-nv,2.)*${o.fuzz || '.55'}; }
        #include <opaque_fragment>`);
    };
    W.compileTree = sh => {
      add(sh); sh.uniforms.uWind = W.U.uWind; VW(sh);
      sh.vertexShader = 'uniform float uT; uniform vec3 uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        { vec3 ip=instanceMatrix[3].xyz; float ph=ip.x*.35+ip.z*.22; float h=max(transformed.y,0.); float k=h*h*.0016*(.5+uWind.x*.35); transformed.x+=k*(sin(uT*1.3+ph)+.35*sin(uT*3.1+ph*2.)+uWind.x*.4); transformed.z+=k*.7*sin(uT*1.7+ph*1.4); float fl=length(transformed.xz)*.012*(.4+uWind.x*.3); transformed.y+=fl*sin(uT*4.3+ph*3.+transformed.x*3.+transformed.z*2.); }
        #endif`);
      sh.fragmentShader = HEAD + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 wn=normalize(vWN); float fs=gl_FrontFacing?1.:-1.; vec4 t=texture2D(uNz,vWP.xz*.21+vWP.y*.13), f=texture2D(uNz,vLP.xz*.9+vLP.y*.7); float up=abs(wn.y)*.75+.25*wn.y*fs; float lum=dot(diffuseColor.rgb,vec3(.3333));
          sfxS=smoothstep(.34,.66,up+(t.r-.5)*.5+(f.g-.5)*.55); sfxS=max(sfxS*.92,smoothstep(.42,.62,lum)); diffuseColor.rgb=mix(diffuseColor.rgb*vec3(.80,1.02,.92),vec3(.84,.885,.955)*(.82+.28*f.r),sfxS); roughnessFactor=.9; sfxWN=normalize(wn*fs+vec3(f.b-.5,.25,f.a-.5)*.7); normal=normalize((viewMatrix*vec4(sfxWN,0.)).xyz); }`)
        .replace('#include <opaque_fragment>', `{ vec3 V=normalize(cameraPosition-vWP); float nv=clamp(abs(dot(sfxWN,V)),0.,1.); float rim=pow(1.-nv,3.); ${RIM} float tr=pow(clamp(dot(-V,uKeyD),0.,1.),3.); outgoingLight+=diffuseColor.rgb*uKeyC*tr*.22; }
        #include <opaque_fragment>`);
    };
    W.compileBridge = sh => {
      add(sh); VW(sh); sh.fragmentShader = HEAD + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n { vec3 wn=normalize(vWN); vec4 t=sfxTri(vWP,wn,.4); sfxWN=wn; sfxS=smoothstep(.45,.72,wn.y+(t.r-.5)*.6); diffuseColor.rgb=mix(diffuseColor.rgb*(.8+.4*t.g),vec3(.87,.90,.96),sfxS); }')
        .replace('#include <opaque_fragment>', `{ vec3 V=normalize(cameraPosition-vWP); float rim=pow(1.-clamp(dot(sfxWN,V),0.,1.),3.); ${RIM} }\n#include <opaque_fragment>`);
    };

    /* houses: face-local coordinates + a material id, computed once per prototype */
    W.houseAttr = (geo, map) => { const g = geo.attributes, n = g.position.count, a = new Float32Array(n * 3), c = new THREE.Color(), keys = map.map(([hex, k]) => { const q = new THREE.Color(hex); return [q.r, q.g, q.b, k]; });
      for (let i = 0; i < n; i++) { const x = g.position.getX(i), y = g.position.getY(i), z = g.position.getZ(i), nx = Math.abs(g.normal.getX(i)), ny = Math.abs(g.normal.getY(i)), nz = Math.abs(g.normal.getZ(i)); let k = 0; for (const q of keys) if (Math.abs(g.color.getX(i) - q[0]) + Math.abs(g.color.getY(i) - q[1]) + Math.abs(g.color.getZ(i) - q[2]) < .01) k = q[3];
        if (ny > nx && ny > nz) { a[i * 3] = x; a[i * 3 + 1] = z; k = k === 1 ? 0 : k; } else if (nx > nz) { a[i * 3] = z; a[i * 3 + 1] = y; } else { a[i * 3] = x; a[i * 3 + 1] = y; } a[i * 3 + 2] = k; }
      geo.setAttribute('aB', new THREE.BufferAttribute(a, 3)); return geo; };

    /* ---- instanced dressing: a fixed slot of instances per terrain chunk ---- */
    const jit = (geo, amt, sd) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (vn(x * 2.3 + sd, y * 2.1 + z * 1.7 + sd) - .5) * amt; p.setXYZ(i, x * k, y * k, z * k); } geo.computeVertexNormals(); return geo; };
    const sm = geo => { const g = geo.toNonIndexed ? geo : geo; return g; };
    const snowMatS = ctx.patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 }), () => {}, sh => W.compileStatic(sh, false));
    const leafMat = ctx.patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, side: THREE.DoubleSide }), () => {}, sh => W.compileStatic(sh, false));
    const iceM = ctx.patch(new THREE.MeshStandardMaterial({ color: 0xa8d4f4, roughness: .12, metalness: 0, transparent: true, opacity: .86, emissive: 0x0c2a4c, emissiveIntensity: .7 }), () => {}, sh => { add(sh); VW(sh); sh.fragmentShader = HEAD + sh.fragmentShader.replace('#include <opaque_fragment>', `{ vec3 V=normalize(cameraPosition-vWP); float nv=clamp(abs(dot(normalize(vWN),V)),0.,1.); float F=pow(1.-nv,3.); vec4 t=texture2D(uNz,vLP.xy*1.3+vWP.z*.1); outgoingLight+=uSkyC*F*.9+uKeyC*pow(clamp(dot(-V,uKeyD),0.,1.),2.)*.28*vec3(.5,.8,1.); outgoingLight=mix(outgoingLight,outgoingLight*1.5+.05,smoothstep(.55,.7,t.g)*.5); diffuseColor.a=mix(.62,1.,F); }\n#include <opaque_fragment>`); });
    const G = {};
    { const r0 = paint(jit(new THREE.IcosahedronGeometry(1, 2), .75, 3), 0x3a3f4c); r0.scale(1.15, .72, 1); G.rock = r0;
      
      const tuft = []; for (let i = 0; i < 9; i++) { const a = i * 2.4, h = .35 + (i % 4) * .13, b = new THREE.ConeGeometry(.018, h, 3); tuft.push(P_(b, i % 3 ? 0x7a6038 : 0x9a8252, Math.cos(a) * .09, h / 2, Math.sin(a) * .09, Math.sin(a) * .35, 0, -Math.cos(a) * .35)); } G.tuft = merge(tuft);
      const ic = []; for (let i = 0; i < 6; i++) { const a = i * 1.05, h = .7 + (i * 37 % 5) * .32, c = new THREE.CylinderGeometry(.02, .2, h, 5); ic.push(P_(c, 0xffffff, Math.cos(a) * .3, h * .42, Math.sin(a) * .3, Math.sin(a) * .4, a, -Math.cos(a) * .4)); } G.ice = merge(ic); G.ice.deleteAttribute('color');
      const cl = P_(new THREE.ConeGeometry(.055, .6, 5), 0xffffff, 0, -.3, 0, Math.PI); cl.deleteAttribute('color'); G.icicle = cl;
      const lc = []; lc.push(P_(new THREE.CylinderGeometry(.12, .2, 1.2, 5), 0x2c211a, 0, .6, 0)); for (let i = 0; i < 4; i++) { lc.push(P_(new THREE.ConeGeometry(1.75 - i * .38, 2.0 - i * .15, 7), i % 2 ? 0x16302a : 0x1c3a30, 0, 1.6 + i * 1.15, 0, 0, i)); lc.push(P_(new THREE.ConeGeometry(1.5 - i * .34, 1.0, 7), 0xdfe8f8, 0, 2.15 + i * 1.15, 0, 0, i + .4)); } G.far = merge(lc); }
    const mk = (name, geo, mat, cap, cast) => { const im = new THREE.InstancedMesh(geo, mat, cap * NCH); im.frustumCulled = false; im.castShadow = cast; im.receiveShadow = true; im.visible = false; const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < cap * NCH; i++) im.setMatrixAt(i, z); scene.add(im); const k = { name, im, cap }; W.kinds.push(k); W[name] = k; return k; };
    mk('rock', G.rock, snowMatS, 9, true); mk('tuft', G.tuft, leafMat, 44, false); mk('ice', G.ice, iceM, 5, false); mk('icicle', G.icicle, iceM, 90, false); mk('far', G.far, snowMatS, 46, false);
    W.setFar = parts => { if (!parts || !parts.length || W.far2) return; const n = W.far.cap * NCH; W.far.im.geometry = parts[0].g; W.far.im.material = parts[0].im.material; if (parts[1]) { const im = new THREE.InstancedMesh(parts[1].g, parts[1].im.material, n); im.instanceMatrix = W.far.im.instanceMatrix; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; im.visible = false; scene.add(im); W.far2 = im; } };   // the same spruces as by the track, without shadows
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    const bufs = {};
    W.height = (u, z) => { const sh = spH(u, z, true); return ctx.baseH(u, z) + NS.drift(u, z, halfW(z), sh); };
    /* called at the end of Chunk.build. info: { rows, houses: [{ m, kind }], village } */
    W.chunk = (chunk, slot, info) => {
      let s = (Math.abs(chunk.index * 48271 + ctx.salt() * 7 + 911) % 2147483646) + 1; const R = () => (s = (s * 48271) % 2147483647, (s - 1) / 2147483646);
      const z0 = -chunk.index * CH, cnt = {}, skip = {}; for (const k of W.kinds) cnt[k.name] = 0;
      const put = (name, x, y, z, ry, sx, sy = sx, sz = sx, rx = 0, rz = 0) => { const k = W[name]; if (cnt[name] >= k.cap) return; const kp = k.keep === undefined ? 1 : k.keep; if (hh(cnt[name] * 7 + slot * 131, chunk.index * 13 + (skip[name] = (skip[name] || 0) + 1)) > kp) return; _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); k.im.setMatrixAt(slot * k.cap + cnt[name]++, _m); };
      const blocked = (u, z) => info.rows.some(r => r.side === Math.sign(u) && Math.abs(u) > 10.5 && Math.abs(u) < 29 && z < r.z0 + 2 && z > r.z1 - 2);
      const at = (lo, hi, pw = 1) => { const side = R() < .5 ? -1 : 1, z = z0 - R() * CH; return { z, u: side * (halfW(z) + lo + Math.pow(R(), pw) * (hi - lo)) }; };
      const flat = (u, z) => Math.abs(spH(u, z, true)) < .05, tirol = ctx.lv() === 'tirol', edge = tirol ? 1.4 : 2.6;
      for (let i = 0; i < 9; i++) { const { u, z } = at(edge, tirol ? 9 : 24, 1.4); if (blocked(u, z) || !flat(u, z)) { R(); R(); continue; } const sc = .25 + Math.pow(R(), 2) * 1.25; put('rock', cx(z) + u, W.height(u, z) - .12 * sc, z, R() * 6.28, sc, sc * (.7 + R() * .5), sc); }
      for (let i = 0; i < 44; i++) { const { u, z } = at(edge - .3, tirol ? 8 : 17, 1.8); if (blocked(u, z) || !flat(u, z)) { R(); continue; } const sc = .7 + R() * .9; put('tuft', cx(z) + u, W.height(u, z) - .06, z, R() * 6.28, sc); }
      for (let i = 0; i < 5; i++) { if (R() > .4) continue; const { u, z } = at(3, 12); if (blocked(u, z) || !flat(u, z)) continue; const sc = .55 + R() * .8; put('ice', cx(z) + u, W.height(u, z) - .1, z, R() * 6.28, sc); }
      if (!tirol) for (let i = 0; i < 46; i++) { const { u, z } = at(26, 74, .9); if (!flat(u, z)) continue; const sc = .8 + R() * .9, n = vn(u * .04, z * .04); if (n < .34) continue; put('far', cx(z) + u, W.height(u, z) - .4, z, R() * 6.28, sc, sc * (1 + R() * .35), sc, (R() - .5) * .06, (R() - .5) * .06); }
      else for (let i = 0; i < 46; i++) { const { u, z } = at(8, 64, .8); if (blocked(u, z) || !flat(u, z)) continue; const sc = .8 + R() * .9; put('far', cx(z) + u, W.height(u, z) - .4, z, R() * 6.28, sc, sc * (1.1 + R() * .4), sc); }
      chunk.chim = [];
      for (const h of info.houses) { const park = h.kind === 'house', eY = park ? 9.96 : 4.86, w = park ? 3.4 : 4.1;
        for (let i = 0; i < (park ? 14 : 10); i++) { const x = -w + 2 * w * R(), L = .35 + R() * .9; if (park) _p.set(x, eY, 3.24); else { const t = R(), sd = R() < .5 ? -1 : 1; _p.set(sd * 4.15 * (1 - t), 4.9 + 2.6 * t, 3.98); } _p.applyMatrix4(h.m); put('icicle', _p.x, _p.y, _p.z, 0, .8 + R() * .7, L, .8 + R() * .7); }
        if (h.kind !== 'church') { const c = new THREE.Vector3(park ? 1.7 : 2.1, park ? 11.2 : 8.1, -1.2).applyMatrix4(h.m); c.ph = R() * 5; chunk.chim.push(c); } }
      for (const k of W.kinds) { for (let i = cnt[k.name]; i < k.cap; i++) k.im.setMatrixAt(slot * k.cap + i, ZERO); k.im.instanceMatrix.needsUpdate = true; }
      W.applyDensity();
    };
    W.applyDensity = () => { const v = W.s ? W.s.veg : 1; for (const k of W.kinds) { const l = k.name === 'far' ? (W.s.lod < 1 ? .4 : W.s.draw < 1 ? .6 : 1) : 1; k.im.visible = W.on && v > 0; k.im.count = k.cap * NCH; k.keep = Math.min(1, v * .67 * l * (W.s.lod > 1 ? 1.2 : 1)); } if (W.far2) W.far2.visible = W.far.im.visible; };

    /* ---- backdrops: three ridge lines with aerial perspective, far behind everything ---- */
    const rg = []; const ridgeU = { uNz: { value: noiseTex }, uFogC: { value: FOG }, uKeyC: snow.U.uKeyC, uSkyC: snow.U.uSkyC, uGlowC: { value: new THREE.Color() }, uGk: { value: 1 } };
    for (let l = 0; l < 3; l++) {
      const SEG = 220, RO = 5, pos = [], uv = [], idx = []; for (let i = 0; i <= SEG; i++) for (let r = 0; r <= RO; r++) { const a = -Math.PI * .5 + (i / SEG - .5) * Math.PI * 1.15; pos.push(Math.cos(a), r / RO, Math.sin(a)); uv.push(i / SEG, r / RO); }
      for (let i = 0; i < SEG; i++) for (let r = 0; r < RO; r++) { const a = i * (RO + 1) + r, b = a + RO + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      const u = Object.assign({ uL: { value: l }, uH: { value: 100 }, uBase: { value: -60 }, uRad: { value: 700 }, uOff: { value: 0 }, uSharp: { value: 1 } }, ridgeU);
      const m = new THREE.ShaderMaterial({ uniforms: u, side: THREE.DoubleSide, fog: false, depthWrite: true,
        vertexShader: `uniform float uL,uH,uBase,uRad,uOff,uSharp; varying vec2 vUv; varying float vH; varying vec3 vD;
          float h1(float x){ return fract(sin(x*127.1+uL*31.7)*43758.5453); } float n1(float x){ float i=floor(x),f=x-i; f=f*f*(3.-2.*f); return mix(h1(i),h1(i+1.),f); }
          float ridge(float x){ float s=0.,a=.5,w=1.; for(int o=0;o<6;o++){ float n=1.-abs(n1(x)*2.-1.); n=mix(n1(x*.9+3.),n*n,uSharp); s+=n*a*w; w=clamp(n*1.6,0.,1.); x=x*2.07+5.3; a*=.5; } return s; }
          void main(){ vUv=uv; float x=uv.x*(9.+uL*3.)+uOff; float h=ridge(x); vH=h; float y=uBase+position.y*(h*uH)+ (position.y-1.)*60.; vec3 p=vec3(position.x*uRad,y,position.z*uRad); p.xz*=1.-position.y*.12*uSharp; vD=normalize(p); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
        fragmentShader: `uniform sampler2D uNz; uniform vec3 uFogC,uKeyC,uSkyC,uGlowC; uniform float uL,uGk,uSharp; varying vec2 vUv; varying float vH; varying vec3 vD;
          void main(){ vec2 q=vec2(vUv.x*(16.+uL*5.),vUv.y*vH*2.2); vec4 t=texture2D(uNz,q*vec2(.5,.5)+uL*.37), f=texture2D(uNz,q*vec2(1.9,1.3)); float hgt=vUv.y*vH; float sn=smoothstep(.18,.46,hgt+(t.r-.5)*.55+(f.g-.5)*.25); vec3 n=normalize(vec3((t.b-.5)*2.2+(f.b-.5),.55,(t.a-.5)+.5)); float df=clamp(dot(n,normalize(vec3(-.5,.6,.35)))*.6+.4,0.,1.);
            vec3 rock=mix(vec3(.05,.06,.09),vec3(.12,.12,.15),f.r); vec3 forest=vec3(.018,.032,.045)*(1.+f.g); vec3 low=mix(forest,rock,smoothstep(.1,.3,hgt)*uSharp); vec3 c=mix(low,vec3(.62,.70,.86),sn*mix(.5,1.,uSharp)); c*=uSkyC*.42+uKeyC*df*.34; c+=uGlowC*uGk*pow(max(-vD.z,0.),3.)*smoothstep(.1,.9,vUv.y)*.10*df;
            float hz=mix(.48,.80,uL*.5); hz=max(hz,smoothstep(.5,0.,vUv.y)*.97); hz=max(hz,smoothstep(.05,-.10,vD.y)); c=mix(c,uFogC*(1.+.25*max(-vD.z,0.)),hz); gl_FragColor=vec4(c,1.);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }` });
      const me = new THREE.Mesh(g, m); me.frustumCulled = false; me.renderOrder = -9 + (2 - l) * -.1; me.visible = false; scene.add(me); rg.push(me);
    }
    W.ridges = rg;
    /* ---- mountains beside the Alpine track: ridged geometry instead of cones ---- */
    let mt = null; const mtM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92, fog: false });
    mtM.onBeforeCompile = sh => { add(sh); sh.uniforms.uHaze = { value: FOG }; VW(sh); sh.fragmentShader = HEAD + 'uniform vec3 uHaze;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 wn=normalize(vWN); vec4 a=sfxTri(vWP,wn,.0042), b=sfxTri(vWP,wn,.017), c=sfxTri(vWP,wn,.07); vec3 nw=normalize(wn+vec3(a.b-.5,0.,a.a-.5)*.9+vec3(b.b-.5,(b.r-.5)*.4,b.a-.5)*.8+vec3(c.b-.5,0.,c.a-.5)*.35); float sn=smoothstep(.22,.46,nw.y+(b.r-.5)*.35+(c.g-.5)*.2+smoothstep(-200.,500.,vWP.y-cameraPosition.y)*.16); vec3 rk=mix(vec3(.06,.065,.085),vec3(.17,.165,.18),b.g)*(.75+.5*smoothstep(.45,.55,fract(vWP.y*.021+a.r*1.7))); diffuseColor.rgb=mix(rk,vec3(.84,.88,.95),sn); sfxS=sn; sfxWN=nw; normal=normalize((viewMatrix*vec4(nw,0.)).xyz); }`)
      .replace('#include <opaque_fragment>', `{ float dd=length(vWP-cameraPosition); float hz=1.-exp(-dd*.0006); float low=smoothstep(-90.,-420.,vWP.y-cameraPosition.y)*.8; vec3 V=normalize(cameraPosition-vWP); float m=pow(max(dot(-V,normalize(vec3(-.38,.36,-.85))),0.),4.); outgoingLight+=uSkyC*pow(1.-clamp(dot(sfxWN,V),0.,1.),3.)*.12*sfxS; outgoingLight=mix(outgoingLight,uHaze*(1.+.6*m),max(hz,low)); }
      #include <opaque_fragment>`); };
    const fbm = (x, y) => { let s = 0, a = .5, w = 1; for (let o = 0; o < 6; o++) { const n = 1 - Math.abs(vn(x, y) * 2 - 1); s += n * n * a * w; w = Math.min(1, n * 1.7); x = x * 2.03 + 11.1; y = y * 2.03 - 7.7; a *= .5; } return s; };
    const mkMt = sd => { const g = new THREE.ConeGeometry(1, 1, 84, 44, true).translate(0, .5, 0), p = g.attributes.position, col = new Float32Array(p.count * 3).fill(1);
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z), cxA = Math.cos(a), sA = Math.sin(a); const n = fbm(cxA * 1.6 + sd * 5 + y * 1.1, sA * 1.6 + sd * 3 - y * 1.4), n2 = fbm(cxA * 4.1 + y * 4 + sd, sA * 4.1 - y * 4); const k = .62 + n * .72 + (n2 - .4) * .18; p.setXYZ(i, x * k, Math.max(0, y + (n2 - .4) * .05 * (1 - y) + (y > .93 ? (n - .4) * .03 : 0)), z * k); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); g.computeVertexNormals(); return g; };

    /* ---- scarf: a little verlet chain behind the kid ---- */
    const SCN = 9, sp = Array.from({ length: SCN }, () => new THREE.Vector3()), so = Array.from({ length: SCN }, () => new THREE.Vector3()); let scInit = false;
    const scTex = ctx.canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#b5281f'; g.fillRect(0, 0, w, h); for (const y of [180, 206]) { g.fillStyle = '#f0e6d6'; g.fillRect(0, y, w, 12); } for (let y = 0; y < h; y += 6) for (let x = 0; x < w; x += 8) { g.strokeStyle = `rgba(0,0,0,${.16 + (x / 8 + y / 6) % 2 * .06})`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y + 5); g.lineTo(x + 8, y); g.stroke(); } g.globalCompositeOperation = 'destination-out'; for (let x = 0; x < w; x += 7) g.fillRect(x, h - 22, 3, 22); });
    const scG = new THREE.BufferGeometry(), scP = new Float32Array(SCN * 2 * 3), scUv = []; for (let i = 0; i < SCN; i++) scUv.push(0, 1 - i / (SCN - 1), 1, 1 - i / (SCN - 1)); scG.setAttribute('position', new THREE.BufferAttribute(scP, 3)); scG.setAttribute('uv', new THREE.Float32BufferAttribute(scUv, 2)); { const id = []; for (let i = 0; i < SCN - 1; i++) { const a = i * 2; id.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } scG.setIndex(id); } scG.computeVertexNormals();
    const scM = new THREE.MeshStandardMaterial({ map: scTex, side: THREE.DoubleSide, roughness: 1, alphaTest: .4 }); const scarf = new THREE.Mesh(scG, scM); scarf.frustumCulled = false; scarf.castShadow = true; scarf.visible = false; scene.add(scarf); W.scarf = scarf;
    const _an = new THREE.Vector3(), _v = new THREE.Vector3(), _x = new THREE.Vector3(), _d = new THREE.Vector3();
    W.updateScarf = (dt, inner, vis, speed, wind, time, floor) => {
      scarf.visible = W.on && vis; if (!scarf.visible) { scInit = false; return; }
      _an.set(.10, 1.0, .20); inner.localToWorld(_an); _x.set(1, 0, 0).transformDirection(inner.matrixWorld);
      if (!scInit || sp[0].distanceToSquared(_an) > 16) { for (let i = 0; i < SCN; i++) { sp[i].copy(_an).add(_v.set(0, -.02 * i, .08 * i)); so[i].copy(sp[i]); } scInit = true; }
      const mv = _v.subVectors(_an, sp[0]).clone(); for (let i = 1; i < SCN; i++) { sp[i].add(mv); so[i].add(mv); }        // ride along with the sled, then let drag pull it back
      const n = 2, h = Math.min(dt, .033) / n; for (let k = 0; k < n; k++) { sp[0].copy(_an);
        for (let i = 1; i < SCN; i++) { const f = i / SCN, tx = sp[i].x, ty = sp[i].y, tz = sp[i].z; const ax = Math.sin(time * 9 + i * .9) * (1.5 + speed * .16) * f + wind.x * .6, ay = -5 + Math.sin(time * 11 + i * 1.3) * speed * .10 * f + speed * .10, az = 6 + speed * .55 + wind.z * .4; sp[i].x += (tx - so[i].x) * .93 + ax * h * h; sp[i].y += (ty - so[i].y) * .93 + ay * h * h; sp[i].z += (tz - so[i].z) * .93 + az * h * h; so[i].set(tx, ty, tz); if (sp[i].y < floor + .12) sp[i].y = floor + .12; }
        for (let it = 0; it < 4; it++) for (let i = 1; i < SCN; i++) { _d.subVectors(sp[i], sp[i - 1]); const l = _d.length() || 1e-4; _d.multiplyScalar((l - .085) / l); if (i === 1) sp[i].sub(_d); else { sp[i].addScaledVector(_d, -.5); sp[i - 1].addScaledVector(_d, .5); } } }
      for (let i = 0; i < SCN; i++) { const tw = Math.sin(time * 5 + i * .7) * .35 * i / SCN, wd = .075; for (let e = 0; e < 2; e++) { const k = (i * 2 + e) * 3, sgn = e ? wd : -wd; scP[k] = sp[i].x + _x.x * sgn; scP[k + 1] = sp[i].y + _x.y * sgn + sgn * tw; scP[k + 2] = sp[i].z + _x.z * sgn; } }
      scG.attributes.position.needsUpdate = true; scG.computeVertexNormals();
    };
    ctx.patch(scM, () => {}, sh => W.compileCloth(sh, { ds: true, fuzz: '.9', weave: '.9', snow: '0.' }));

    W.configure = (on, s) => {
      W.on = on; W.s = s; W.applyDensity(); for (const r of rg) r.visible = on;
      if (on && !mt) mt = [1.1, 2.7, 4.3, 5.9].map(mkMt);
      for (const o of ctx.mtns) { if (!o.g0) { o.g0 = o.m.geometry; o.m0 = o.m.material; } o.m.geometry = on ? mt[o.i % 4] : o.g0; o.m.material = on ? mtM : o.m0; }
      scarf.visible = false;
    };
    W.update = (dt, time, sky, lv, wind, zP) => {
      if (!W.on) return; W.U.uWind.value.copy(wind).multiplyScalar(.3); ridgeU.uGlowC.value.copy(sky.cur.glow); ridgeU.uGk.value = sky.cur.gk; const t = lv === 'tirol';
      const cfg = t ? [[860, 420, -260, 1], [1120, 560, -250, 1], [1420, 700, -230, 1]] : [[690, 120, -105, .55], [960, 210, -110, .75], [1320, 330, -120, 1]];
      rg.forEach((r, l) => { const u = r.material.uniforms, c = cfg[l]; r.position.copy(camera.position); u.uRad.value = c[0]; u.uH.value = c[1]; u.uBase.value = c[2]; u.uSharp.value = c[3]; u.uOff.value = zP * -.0012 / (1 + l * .8) + l * 17 + (t ? 40 : 0); });
    };
    W.dispose = () => { for (const k of W.kinds) k.im.dispose(); };
    return W;
  };
})();
