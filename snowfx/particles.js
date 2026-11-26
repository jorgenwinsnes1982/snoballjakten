/* SnowFX Extreme – GPU particles (stateless, instanced), spindrift along the ground, ice dust in the air. */
(() => {
  const NS = window.SNOWFX = window.SNOWFX || {};
  NS.T = { PUFF: 0, CHIP: 1, SMOKE: 2, EMBER: 3, CRYSTAL: 4 };

  NS.createParticles = ({ THREE, renderer, scene, camera, noiseTex, snowU, ptUniforms, pipe }) => {
    /* sprite atlas 2x2: powder puff, hard chip, wispy smoke, soft glow – drawn once */
    const A = 256, cv = document.createElement('canvas'); cv.width = cv.height = A; const g = cv.getContext('2d'), im = g.createImageData(A, A);
    const nd = noiseTex.image.data, NN = noiseTex.image.width, nz = (x, y) => nd[((((y % NN) + NN) % NN | 0) * NN + (((x % NN) + NN) % NN | 0)) * 4] / 255, nf = (x, y) => nd[((((y % NN) + NN) % NN | 0) * NN + (((x % NN) + NN) % NN | 0)) * 4 + 1] / 255;
    const H = A / 2; for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) { const tx = x >= H ? 1 : 0, ty = y >= H ? 1 : 0, u = ((x % H) + .5) / H * 2 - 1, v = ((y % H) + .5) / H * 2 - 1, r = Math.hypot(u, v); let a = 0; const t = ty * 2 + tx;
      if (t === 0) { const n = nz(x * 1.3, y * 1.3) * .6 + nf(x * 1.1 + 40, y * 1.1) * .4; a = Math.max(0, 1 - r); a = a * a * (3 - 2 * a) * (.35 + 1.1 * n); }
      else if (t === 1) { const th = Math.atan2(v, u), k = .62 + .2 * Math.cos(th * 3 + .4) + .1 * Math.cos(th * 5 + 1.7); a = Math.max(0, Math.min(1, (k - r) * 9)); }
      else if (t === 2) { const n = nz(x * .9 + 90, y * .9 + 30) * .7 + nf(x * .8, y * .8) * .3; a = Math.max(0, (1 - r) * 1.25) * Math.max(0, Math.min(1, (n - .22) * 1.9)); }
      else a = Math.pow(Math.max(0, 1 - r), 2.4);
      const i = (y * A + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = a * 255; }
    g.putImageData(im, 0, 0);
    const atlas = new THREE.DataTexture(new Uint8Array(im.data), A, A, THREE.RGBAFormat); atlas.magFilter = THREE.LinearFilter; atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.generateMipmaps = true; atlas.needsUpdate = true;

    const CAP = 5200, PT = { on: false, k: 1, alive: 0, cap: CAP, i: 0, time: 0 };
    const geo = new THREE.InstancedBufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = () => { const b = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4); b.setUsage(THREE.DynamicDrawUsage); return b; };
    const aP = mk(), aV = mk(), aC = mk(), aM = mk(); geo.setAttribute('aP', aP); geo.setAttribute('aV', aV); geo.setAttribute('aC', aC); geo.setAttribute('aM', aM);
    for (let i = 0; i < CAP; i++) { aP.array[i * 4 + 3] = -99; aV.array[i * 4 + 3] = .01; }
    const U = PT.U = { uT: { value: 0 }, uAt: { value: atlas }, uPrev: pipe.prevTex, uPR: { value: new THREE.Vector2(1, 1) }, uSoft: { value: 0 }, uLampP: snowU.uLamps, uKeyD: { value: new THREE.Vector3(-.33, .71, -.62) }, uKeyC: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uWind: { value: new THREE.Vector3() }, uFogC: { value: scene.fog.color }, uFogN: { value: new THREE.Vector2(30, 200) } };
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true, uniforms: U,
      vertexShader: `attribute vec4 aP,aV,aC,aM; uniform float uT; uniform vec3 uWind,uKeyC,uSky,uKeyD; uniform vec3 uLampP[5]; varying vec2 vQ,vUv; varying vec4 vC; varying float vTy,vZ,vAge; varying vec3 vL; varying vec2 vRs;
        void main(){ float t=uT-aP.w, life=aV.w; vAge=t/life; vTy=aM.y; if(t<0.||vAge>=1.){ gl_Position=vec4(2.,2.,2.,1.); return; }
          float ty=aM.y, seed=aM.z, drag=aM.w; vec3 p=aP.xyz; float e=(1.-exp(-drag*t))/drag; p+=aV.xyz*e;
          float gr=ty<.5?1.5:ty<1.5?9.:ty<2.5?-.55:ty<3.5?-.6:.5; float term=gr/drag; p.y-=term*(t-e);
          float tb=ty<.5?.5:ty<1.5?.05:ty<2.5?.75:ty<3.5?.5:.6; vec3 s=vec3(seed*37.,seed*91.,seed*53.); p+=tb*vec3(sin(t*2.1+s.x+p.z*.4),sin(t*1.7+s.y)*.6,cos(t*1.9+s.z+p.x*.4))*t*.55;
          p+=uWind*(ty<.5?.10:ty<1.5?.01:ty<2.5?.16:.12)*t*t/(t+.4);
          float sz=aM.x; float grow=ty<.5?.55+vAge*2.3:ty<1.5?1.-vAge*.3:ty<2.5?.5+vAge*2.6:ty<3.5?1.-vAge*.7:1.; sz*=grow;
          vec4 mv=viewMatrix*vec4(p,1.); float rot=seed*6.283+t*(ty<1.5&&ty>.5?9.:1.4)*(fract(seed*7.)-.5)*2.; vec2 q=position.xy; vRs=vec2(cos(rot),sin(rot)); vec2 r=vec2(vRs.x*q.x-vRs.y*q.y,vRs.y*q.x+vRs.x*q.y);
          mv.xy+=r*sz; gl_Position=projectionMatrix*mv; vZ=-mv.z; vQ=r; 
          float tile=ty<.5?0.:ty<1.5?1.:ty<2.5?2.:3.; vUv=(position.xy*.49+.5)*.5+vec2(mod(tile,2.),floor(tile*.5))*.5;
          float a=aC.w; a*=ty<.5?min(1.,vAge*9.)*pow(1.-vAge,1.5):ty<1.5?smoothstep(1.,.75,vAge):ty<2.5?min(1.,vAge*4.)*pow(1.-vAge,1.3):1.-vAge; a*=smoothstep(.5,1.7,vZ);
          if(ty>3.5) a*=.35+.65*pow(abs(sin(t*(5.+seed*9.)+seed*40.)),6.);
          vec3 l=vec3(0.); for(int i=0;i<5;i++){ vec3 d=p-uLampP[i]; l+=vec3(1.,.60,.27)*(6.5/(1.+dot(d,d)*.16)); } vL=l; vC=vec4(aC.rgb,a); }`,
      fragmentShader: `uniform sampler2D uAt,uPrev; uniform vec2 uPR; uniform float uSoft; uniform vec3 uKeyC,uSky,uKeyD,uFogC; uniform vec2 uFogN; varying vec2 vQ,vUv; varying vec4 vC; varying float vTy,vZ,vAge; varying vec3 vL;
        void main(){ float a=texture2D(uAt,vUv).a*vC.a; if(a<.004) discard;
          if(uSoft>.5&&vTy<2.5&&(vTy<.5||vTy>1.5)){ float sz=texture2D(uPrev,gl_FragCoord.xy/uPR).a; a*=clamp((sz-vZ)/.55,0.,1.)*.85+.15; }
          vec3 c; float add=0.;
          if(vTy<.5){ vec3 n=normalize(vec3(vQ,sqrt(max(.05,1.-dot(vQ,vQ))))); vec3 ld=normalize((viewMatrix*vec4(uKeyD,0.)).xyz); float df=clamp(dot(n,ld)*.5+.5,0.,1.); float fw=pow(clamp(-ld.z,0.,1.),2.); c=vC.rgb*(uSky*(1.15+.3*n.y)+uKeyC*(.22+df*.45+fw*(1.-a)*.6)+vL*.45); }
          else if(vTy<1.5) c=vC.rgb*(uSky*.8+uKeyC*.55+vL*.6);
          else if(vTy<2.5) c=vC.rgb*(uSky*.6+uKeyC*.18+vL*.35);
          else if(vTy<3.5){ c=vC.rgb; add=1.; }
          else { c=vec3(.8,.9,1.)*(uKeyC*1.2+vL*.8+uSky*.3); add=1.; }
          float f=clamp((vZ-uFogN.x)/(uFogN.y-uFogN.x),0.,1.); c=mix(c,add>.5?vec3(0.):uFogC,f*f*.8);
          gl_FragColor=vec4(c*a,a*(1.-add)); }` });
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false; scene.add(mesh); PT.mesh = mesh;
    let lo = CAP, hi = -1, full = false;
    PT.emit = (type, x, y, z, vx, vy, vz, life, size, alpha, r, gg, b, drag) => {
      const i = PT.i, k = i * 4; PT.i = (i + 1) % CAP; if (PT.i === 0) full = true;
      aP.array[k] = x; aP.array[k + 1] = y; aP.array[k + 2] = z; aP.array[k + 3] = PT.time; aV.array[k] = vx; aV.array[k + 1] = vy; aV.array[k + 2] = vz; aV.array[k + 3] = life;
      aC.array[k] = r; aC.array[k + 1] = gg; aC.array[k + 2] = b; aC.array[k + 3] = alpha; aM.array[k] = size; aM.array[k + 1] = type; aM.array[k + 2] = Math.random(); aM.array[k + 3] = drag; if (i < lo) lo = i; if (i > hi) hi = i; PT.last = PT.time + life > (PT.last || 0) ? PT.time + life : PT.last;
    };
    const R = (a, b) => a + Math.random() * (b - a);
    /* the old CPU emitter's calls land here: same arguments, better particles */
    PT.legacy = (x, y, z, vx, vy, vz, life, size, alpha, r, gg, b) => {
      if (r > 1.25 || gg > 1.6) { PT.emit(3, x, y, z, vx, vy, vz, life * 1.25, size * .62, alpha, r, gg, b, 1.6); return; }
      if (r > .8 && gg > .8 && b > .85) { PT.emit(0, x, y, z, vx * .9, vy * .75, vz * .9, life * 1.9, size * .95, alpha * .5, .95, .97, 1, 2.2); if (Math.random() < .45) PT.emit(1, x, y, z, vx * 1.25, vy * 1.3, vz * 1.25, life * 1.3, size * .10 + .015, .95, .9, .95, 1, .9); return; }
      if (r < .45 && gg < .45 && b < .5) { PT.emit(2, x, y, z, vx, vy, vz, life * 2, size * 1.3, alpha * .5, r, gg, b, 1.2); return; }
      PT.emit(1, x, y, z, vx, vy, vz, life, size * .3, alpha, r, gg, b, 1.2);
    };
    PT.powder = (x, y, z, vx, vy, vz, n, spread, size, life, alpha = .42) => { n = n * PT.k; let c = Math.floor(n); if (Math.random() < n - c) c++; for (let j = 0; j < c; j++) PT.emit(0, x + R(-.1, .1), y, z + R(-.1, .1), vx + R(-spread, spread), vy * R(.4, 1.2), vz + R(-spread, spread), life * R(.7, 1.3), size * R(.6, 1.3), alpha * R(.6, 1.1), .95, .97, 1, R(1.5, 2.6)); };
    PT.chips = (x, y, z, n, spd, up, size = .03) => { n = Math.ceil(n * Math.min(1, PT.k)); for (let j = 0; j < n; j++) PT.emit(1, x, y, z, R(-spd, spd), R(.3, 1) * up, R(-spd, spd), R(.5, 1.1), size * R(.6, 1.6), 1, .88, .94, 1, .7); };
    PT.boom = (x, y, z, r, n) => { for (let j = 0; j < n * PT.k; j++) { const a = R(0, 6.283), s = R(.3, 1) * r; PT.emit(0, x, y, z, Math.cos(a) * s * 3, R(.4, 2.4) * r, Math.sin(a) * s * 3, R(.7, 1.6), r * R(.18, .42), .5, .95, .97, 1, 2.1); } };

    /* ---- spindrift: snow blown along the ground in thin veils, only with wind ---- */
    const SN = 260, sg = new THREE.InstancedBufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3)); sg.setIndex([0, 1, 2, 0, 2, 3]);
    const rnd = new Float32Array(SN * 4); for (let i = 0; i < SN * 4; i++) rnd[i] = Math.random(); sg.setAttribute('aR', new THREE.InstancedBufferAttribute(rnd, 4));
    const SU = PT.SU = { uT: U.uT, uNz: { value: noiseTex }, uCam: { value: camera.position }, uK: { value: 0 }, uPath: { value: new THREE.Vector4() }, uPath2: { value: new THREE.Vector4() }, uOff: { value: new THREE.Vector3() }, uSky: U.uSky, uKeyC: U.uKeyC, uLampP: snowU.uLamps, uGrid: { value: null } };
    const sm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: SU, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: `attribute vec4 aR; uniform float uT; uniform vec3 uCam,uOff; uniform sampler2D uGrid; uniform vec4 uPath2; varying vec2 vUv; varying float vA,vZ; varying vec3 vL; uniform vec3 uLampP[5];
        void main(){ float L=70.; float tp=uCam.z+6.; float z=tp-mod(tp-(aR.x*L+uOff.z),L); float u=(mod(aR.y*34.+uOff.x,34.)-17.); vec4 g=texture2D(uGrid,vec2((u+18.)/36.,(uPath2.x-z)/uPath2.y)); vec3 p=vec3(g.x+u,g.y+.03,z);
          vec2 q=position.xy; float len=1.3+aR.z*2.2, hgt=.10+aR.w*.30; p.x+=q.x*len*.92; p.z+=q.x*len*.35; p.y+=q.y*hgt; vec4 mv=viewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; vZ=-mv.z; vUv=vec2(q.x*.5+.5,q.y); vA=smoothstep(2.,7.,vZ)*(1.-smoothstep(38.,60.,vZ))*step(.5,g.w); vec3 l=vec3(0.); for(int i=0;i<5;i++){ vec3 d=p-uLampP[i]; l+=vec3(1.,.6,.27)*(3./(1.+dot(d,d)*.25)); } vL=l; }`,
      fragmentShader: `uniform sampler2D uNz; uniform float uT,uK; uniform vec3 uSky,uKeyC; varying vec2 vUv; varying float vA,vZ; varying vec3 vL; void main(){ float n=texture2D(uNz,vec2(vUv.x*.35-uT*.55,vUv.y*.16+vA*.1)).r; float a=smoothstep(.45,.8,n)*(1.-vUv.y)*smoothstep(0.,.25,vUv.x)*smoothstep(1.,.75,vUv.x)*vA*uK; if(a<.004) discard; gl_FragColor=vec4((uSky*.75+uKeyC*.22+vL*.35)*a,a); }` });
    const spin = new THREE.Mesh(sg, sm); spin.frustumCulled = false; spin.renderOrder = 5; spin.visible = false; scene.add(spin);
    /* ground grid for spindrift and mist: heights of the path area ahead, sampled from the game's own gY */
    const GW = 12, GH = 24, gd = new Float32Array(GW * GH * 4), gt = new THREE.DataTexture(gd, GW, GH, THREE.RGBAFormat, THREE.FloatType); gt.minFilter = gt.magFilter = THREE.NearestFilter; gt.wrapS = gt.wrapT = THREE.ClampToEdgeWrapping;
    const gdh = new Uint16Array(GW * GH * 4), gth = new THREE.DataTexture(gdh, GW, GH, THREE.RGBAFormat, THREE.HalfFloatType); gth.minFilter = gth.magFilter = THREE.LinearFilter; SU.uGrid.value = gth;
    PT.ground = (zP, cx, gY) => { const z0 = Math.ceil(zP / 4) * 4 + 8; if (PT.gz === z0) return; PT.gz = z0; SU.uPath2.value.set(z0, 96, 0, 0); PT.gbx = cx(zP); PT.gby = gY(0, zP); for (let r = 0; r < GH; r++) { const z = z0 - (r + .5) / GH * 96, c = cx(z); for (let k = 0; k < GW; k++) { const u = (k + .5) / GW * 36 - 18, i = (r * GW + k) * 4; gdh[i] = THREE.DataUtils.toHalfFloat(c - PT.gbx); gdh[i + 1] = THREE.DataUtils.toHalfFloat(gY(u, z) - PT.gby); gdh[i + 2] = 0; gdh[i + 3] = THREE.DataUtils.toHalfFloat(1); } } gth.needsUpdate = true; SU.uPath.value.set(PT.gbx, PT.gby, 0, 0); };
    sm.vertexShader = sm.vertexShader.replace('uniform sampler2D uGrid;', 'uniform sampler2D uGrid; uniform vec4 uPath;').replace('vec3 p=vec3(g.x+u,g.y+.03,z);', 'vec3 p=vec3(uPath.x+g.x+u,uPath.y+g.y+.03,z);');

    PT.configure = (on, s) => { PT.on = on; PT.k = s.part; mesh.visible = on; U.uSoft.value = on && s.snow > 1 ? 1 : 0; if (!on) spin.visible = false; };
    PT.update = (dt, time, sky, pr, w, h) => {
      PT.time = time; U.uT.value = time; if (!PT.on) return;
      U.uKeyC.value.copy(sky.cur.key).multiplyScalar(sky.cur.ki * .55); U.uSky.value.copy(sky.cur.sky).multiplyScalar(sky.cur.hi * 1.05); U.uWind.value.copy(sky.wind); U.uFogN.value.set(Math.abs(scene.fog.near), scene.fog.far); U.uPR.value.set(w, h);
      if (hi >= 0) { for (const b of [aP, aV, aC, aM]) { if (b.clearUpdateRanges) { b.clearUpdateRanges(); if (!full) b.addUpdateRange(lo * 4, (hi - lo + 1) * 4); } else if (!full) { b.updateRange.offset = lo * 4; b.updateRange.count = (hi - lo + 1) * 4; } else b.updateRange.count = -1; b.needsUpdate = true; } lo = CAP; hi = -1; full = false; }
      mesh.visible = (PT.last || 0) > time;
      const k = Math.max(0, Math.min(1, (sky.cur.wind - .35) * .75)) * Math.min(1, PT.k); spin.visible = k > .02; SU.uK.value = k * (.55 + .5 * sky.gust); SU.uOff.value.x += sky.wind.x * dt * 1.7; SU.uOff.value.z += sky.wind.z * dt * 1.2; sg.instanceCount = Math.floor(SN * Math.min(1, .3 + k));
    };
    PT.count = () => { let n = 0; if (!PT.on) return 0; for (let i = 0; i < CAP; i++) if (PT.time - aP.array[i * 4 + 3] < aV.array[i * 4 + 3]) n++; return n; };
    PT.reset = () => { for (let i = 0; i < CAP; i++) aP.array[i * 4 + 3] = -99; full = true; lo = 0; hi = CAP - 1; PT.last = 0; PT.gz = null; };
    return PT;
  };
})();
