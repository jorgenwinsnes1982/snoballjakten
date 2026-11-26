/* SnowFX Extreme – sky, light moods, weather, aurora, clouds, environment probe and fog. */
(() => {
  const NS = window.SNOWFX = window.SNOWFX || {};

  /* ---- tiling noise texture shared by every shader: r = fbm, g = finer fbm, ba = normal (xz) of r. Periodic, mip-mapped. ---- */
  NS.makeNoise = (THREE, N, aniso) => {
    const perm = new Uint8Array(512); { let s = 1337; const r = () => (s = (s * 16807) % 2147483647) / 2147483647, p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (h, x, y) => { h &= 7; const u = h < 4 ? x : y, v = h < 4 ? y : x; return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v) * .5; };
    const pn = (x, y, per, sd) => { const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, u = fade(fx), v = fade(fy), w = k => ((k % per) + per) % per; const h = (a, b) => perm[(perm[(w(a) + sd) & 255] + w(b)) & 255];
      const a = grad(h(X, Y), fx, fy), b = grad(h(X + 1, Y), fx - 1, fy), c = grad(h(X, Y + 1), fx, fy - 1), d = grad(h(X + 1, Y + 1), fx - 1, fy - 1); const l1 = a + (b - a) * u, l2 = c + (d - c) * u; return l1 + (l2 - l1) * v; };
    const A = new Float32Array(N * N), B = new Float32Array(N * N); let a0 = 9, a1 = -9, b0 = 9, b1 = -9;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let a = 0, b = 0, k = 1, p = 4; for (let o = 0; o < 6; o++) { a += pn(x / N * p, y / N * p, p, o * 17) * k; p *= 2; k *= .52; } k = 1; p = 12; for (let o = 0; o < 4; o++) { b += pn(x / N * p, y / N * p, p, 91 + o * 29) * k; p *= 2; k *= .55; } const i = y * N + x; A[i] = a; B[i] = b; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const D = new Uint8Array(N * N * 4), at = (x, y) => (A[((y + N) % N) * N + (x + N) % N] - a0) / (a1 - a0);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x, dx = (at(x + 1, y) - at(x - 1, y)) * N * .02, dy = (at(x, y + 1) - at(x, y - 1)) * N * .02; D[i * 4] = at(x, y) * 255; D[i * 4 + 1] = (B[i] - b0) / (b1 - b0) * 255; D[i * 4 + 2] = Math.max(0, Math.min(255, 127.5 - dx * 127.5)); D[i * 4 + 3] = Math.max(0, Math.min(255, 127.5 - dy * 127.5)); }
    const t = new THREE.DataTexture(D, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = aniso; t.needsUpdate = true; return t;
  };

  /* ---- fog: the same linear range as before, plus forward scattering round the moon and denser air lower down.
     fogNear < 0 switches the SnowFX version on, so the old look stays available with no recompile. ---- */
  NS.installFog = THREE => {
    const S = THREE.ShaderChunk; if (S.__sfx) return; S.__sfx = true;
    S.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying vec3 vFogW;\n#endif';
    S.fog_vertex = '#ifdef USE_FOG\n vFogDepth = -mvPosition.z; vFogW = transpose(mat3(viewMatrix))*mvPosition.xyz;\n#endif';
    S.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogW;\n#ifdef FOG_EXP2\n uniform float fogDensity;\n#else\n uniform float fogNear; uniform float fogFar;\n#endif\n#endif';
    S.fog_fragment = `#ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth ); gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
      #else
        if (fogNear < 0.) { float fd=length(vFogW); vec3 fr=vFogW/max(fd,1e-3); float t=max(fd+fogNear,0.)/(fogFar+fogNear);
          float low=1.+clamp(-vFogW.y*.012,-.35,.9); float ff=1.-exp(-t*t*2.6*low-t*.35);
          float ms=max(dot(fr,normalize(vec3(-.38,.36,-.85))),0.); vec3 fc=fogColor*(1.+.9*pow(ms,6.)+.35*pow(ms,2.))+fogColor.bgr*vec3(.10,.06,.02)*pow(ms,8.);
          gl_FragColor.rgb = mix( gl_FragColor.rgb, fc, clamp(ff,0.,1.) ); }
        else gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, smoothstep( fogNear, fogFar, vFogDepth ) );
      #endif
    #endif`;
  };

  /* ---- moods: colour script for a run, from dusk through the night to sunrise ---- */
  const M = {
    skumring: { top: 0x050a22, mid: 0x18245c, hor: 0x41477f, glow: 0xff7a3a, gk: 1.3, warm: 0xff6a6a, wk: .55, key: 0xb9c6ff, ki: 1.5, sky: 0x6a80cc, gnd: 0x2a2444, hi: .62, star: .45, aur: 0, cloud: .42, cc: 0xc07a8a, near: 26, far: 250, exp: 1.0, snow: .55, wind: .5, mist: .7, shaft: 1, sky2: .9 },
    natt: { top: 0x02050f, mid: 0x0c1740, hor: 0x1a2957, glow: 0xc8703a, gk: .38, warm: 0x3a3a8a, wk: .15, key: 0xa9c0ff, ki: 1.25, sky: 0x4a66b8, gnd: 0x141a38, hi: .48, star: 1, aur: 0, cloud: .25, cc: 0x6f86c8, near: 28, far: 260, exp: 1.04, snow: .45, wind: .4, mist: .9, shaft: 1.25, sky2: .7 },
    nordlys: { top: 0x020713, mid: 0x0a1c40, hor: 0x193556, glow: 0x4a8a7a, gk: .4, warm: 0x2a7a6a, wk: .35, key: 0xa6d2ff, ki: 1.25, sky: 0x4a86b4, gnd: 0x12202e, hi: .62, star: 1, aur: 1, cloud: .1, cc: 0x6fa8c8, near: 30, far: 285, exp: 1.06, snow: .2, wind: .3, mist: .8, shaft: 1.1, sky2: .75 },
    snø: { top: 0x0a1230, mid: 0x22305e, hor: 0x3a4774, glow: 0xd08a5a, gk: .45, warm: 0x8a7a9a, wk: .2, key: 0xc4d0ff, ki: 1.05, sky: 0x7288c4, gnd: 0x2a2c48, hi: .85, star: .05, aur: 0, cloud: .85, cc: 0x8c9ac4, near: 18, far: 200, exp: 1.02, snow: 1.25, wind: 1, mist: 1.1, shaft: .8, sky2: .95 },
    storm: { top: 0x0c1430, mid: 0x2a3558, hor: 0x434f70, glow: 0xa0785a, gk: .3, warm: 0x7a7a94, wk: .15, key: 0xc0cae8, ki: .8, sky: 0x7c8cb8, gnd: 0x30324a, hi: .95, star: 0, aur: 0, cloud: 1, cc: 0x7c8aae, near: 12, far: 172, exp: 1.0, snow: 2, wind: 2.6, mist: 1.6, shaft: .6, sky2: 1 },
    blåtime: { top: 0x0a1c4a, mid: 0x234a94, hor: 0x6f8cc4, glow: 0xffa878, gk: .7, warm: 0xe89ab0, wk: .5, key: 0xc8d8ff, ki: 1.35, sky: 0x7aa0e6, gnd: 0x303c66, hi: .85, star: .3, aur: 0, cloud: .35, cc: 0xd8a0b4, near: 28, far: 280, exp: 1.0, snow: .35, wind: .5, mist: 1, shaft: .9, sky2: 1 },
    soloppgang: { top: 0x16306e, mid: 0x47649f, hor: 0xa8746c, glow: 0xffa050, gk: 1.5, warm: 0xff7a5a, wk: 1.0, key: 0xffbe84, ki: 2.1, sky: 0x7a98d8, gnd: 0x4a3a52, hi: .72, star: 0, aur: 0, cloud: .45, cc: 0xff9a70, near: 34, far: 310, exp: .86, snow: .2, wind: .4, mist: 1.1, shaft: 1.5, sky2: 1.1 },
    klar: { top: 0x01040d, mid: 0x0a1844, hor: 0x182c62, glow: 0x9a6a4a, gk: .4, warm: 0x3a4a9a, wk: .2, key: 0xb4caff, ki: 1.6, sky: 0x4a6ec4, gnd: 0x1c2448, hi: .62, star: 1.2, aur: .35, cloud: .08, cc: 0x6f86c8, near: 34, far: 320, exp: 1.06, snow: .1, wind: .25, mist: .7, shaft: 1.35, sky2: .7 },
  };
  const SEQ = { park: ['skumring', 'natt', 'snø', 'nordlys', 'storm', 'klar', 'blåtime', 'soloppgang'], tirol: ['natt', 'nordlys', 'snø', 'klar', 'blåtime', 'soloppgang', 'skumring', 'storm'] };
  const LEN = 430, MIX = 150;
  const COLS = ['top', 'mid', 'hor', 'glow', 'warm', 'key', 'sky', 'gnd', 'cc'], NUMS = ['gk', 'wk', 'ki', 'hi', 'star', 'aur', 'cloud', 'near', 'far', 'exp', 'snow', 'wind', 'mist', 'shaft', 'sky2'];

  NS.createSky = ({ THREE, renderer, scene, camera, sky, FOG, noiseTex, moon, snowU, cityGlow }) => {
    const L = {}; for (const k in M) { L[k] = {}; for (const c of COLS) L[k][c] = new THREE.Color(M[k][c]); for (const n of NUMS) L[k][n] = M[k][n]; }
    const cur = {}; for (const c of COLS) cur[c] = new THREE.Color(); for (const n of NUMS) cur[n] = 0;
    const legacyMat = sky.material, hemi = scene.children.find(o => o.isHemisphereLight);
    const U = Object.assign({}, legacyMat.uniforms, { uNoise: { value: noiseTex }, uWarm: { value: cur.warm }, uStar: { value: 1 }, uCloud: { value: .3 }, uCloudC: { value: cur.cc }, uGk: { value: 1 }, uWk: { value: 0 }, uAurK: { value: 0 }, uTopF: { value: cur.top }, uMidF: { value: cur.mid }, uGlowF: { value: cur.glow }, uWind: { value: new THREE.Vector2() }, uFlash: { value: 0 } });
    const FS = `uniform vec3 uTopF,uMidF,uHor,uGlowF,uMoon,uWarm,uCloudC; uniform sampler2D uNoise; uniform float uTime,uStar,uCloud,uGk,uWk,uAurK; uniform vec2 uWind; varying vec3 vDir;
      float h13(vec3 p){ p=fract(p*.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
      vec3 h33(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
      vec4 N(vec2 p){ return texture2D(uNoise,p); }
      float stars(vec3 d,float n,float th){ vec3 p=d*n,c=floor(p); float r=h13(c); if(r<th) return 0.; vec3 s=normalize(c+.25+.5*h33(c+7.)); float q=length(d-s)*n; return exp(-q*q*14.)*(.5+.5*sin(uTime*(1.5+r*57.)*.6+r*600.))*((r-th)/(1.-th)); }
      float cl(vec2 p,float cov){ vec2 w=uWind*uTime; float a=N(p*.045+w*.004).r*.62+N(p*.11-w*.006).g*.25+N(p*.31+w*.011).r*.13; return smoothstep(1.-cov*.92,1.-cov*.92+.34,a+.22); }
      float curtain(vec2 p){ float t=uTime*.018; float a=N(p*.032+vec2(t*.25,t*.1)).r; float b=N(p*.058+vec2(a*.42-t*.18,a*.3)).r; float r=1.-abs(b-.5)*5.2; r=max(r,0.); r=r*r*(3.-2.*r); return r*r*smoothstep(.25,.6,N(p*.017-vec2(t*.15,0.)).g); }
      void main(){ vec3 d=normalize(vDir); float y=d.y;
        vec3 c=mix(uHor,uMidF,smoothstep(-.03,.26,y)); c=mix(c,uTopF,smoothstep(.18,.8,y));
        float fw=max(0.,-d.z); float az=pow(fw,2.5);
        c+=uGlowF*az*exp(-abs(y+.02)*8.)*.55*uGk; c+=uWarm*uWk*(.35+.65*az)*exp(-pow((y-.09)*6.,2.))*.38;
        float md=dot(d,uMoon); c+=uMidF*(pow(max(md,0.),5.)*.5+pow(max(md,0.),22.)*.9);      // light scattered round the moon
        c=mix(c,uHor,smoothstep(.0,-.12,y));
        float clear=1.;
        #if CLOUDS>0
        if(y>.015){ vec2 p=d.xz/(y+.09)*1.6; float dens=0.; vec3 cc=vec3(0.);
          #if CLOUDS>=3
          { float tr=1.; vec3 acc=vec3(0.); float j=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5);
            for(int i=0;i<9;i++){ float h=(float(i)+j)/9.; vec2 q=d.xz/(y+.09)*(1.6+h*.34); float f=cl(q,uCloud)*(1.-pow(abs(h*2.-1.),3.)); float up=cl(q+uMoon.xz*.22,uCloud); float lt=exp(-up*1.6)*(.4+.6*h); float a=1.-exp(-f*.62); 
              acc+=tr*a*(uCloudC*(.13+.42*lt)+vec3(.55,.62,.85)*pow(max(md,0.),10.)*lt*.9+uGlowF*uGk*az*.10*(1.-h)); tr*=1.-a; } cc=acc; dens=1.-tr; }
          #else
          { float f=cl(p,uCloud), u=cl(p+uMoon.xz*.3,uCloud); float lt=clamp(f-u+.5,0.,1.); dens=f*.82; cc=(uCloudC*(.12+.36*lt)+vec3(.5,.58,.8)*pow(max(md,0.),12.)*.8*lt+uGlowF*uGk*az*.1)*dens;
            #if CLOUDS>=2
            float f2=cl(p*.55+3.7,uCloud*.8)*.5; cc+=uCloudC*.16*f2*(1.-dens); dens=max(dens,f2); 
            #endif
          }
          #endif
          float fade=smoothstep(.015,.14,y); dens*=fade; c=c*(1.-dens)+cc*fade; clear=1.-dens; }
        #endif
        float sk=smoothstep(.04,.4,y)*clear*uStar;
        if(sk>.01){ float m=stars(d,150.,.985)*2.2+stars(d,340.,.982)*1.1; vec3 ax=normalize(vec3(.5,.35,-.8)); float band=exp(-pow(dot(d,ax)*3.2,2.)); float dust=N(d.xy*.9+d.z*.4).r; c+=vec3(.82,.9,1.)*m*sk; c+=vec3(.10,.13,.22)*band*smoothstep(.35,.9,dust)*sk*.5; }
        #if AURORA>0
        if(uAurK>.01&&y>.03){ vec3 ac=vec3(0.); float j=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5)/float(AURORA);
          for(int i=0;i<AURORA;i++){ float h=float(i)/float(AURORA)+j; vec2 p=d.xz*(1.+h*.62)/(y+.16)*3.1; float k=curtain(p); vec3 tint=mix(vec3(.10,1.,.48),vec3(.42,.22,.95),smoothstep(.12,.75,h)); tint=mix(tint,vec3(.95,.25,.55),smoothstep(.72,1.,h)*.6); ac+=tint*k*exp(-h*2.3); }
          c+=ac/float(AURORA)*uAurK*2.1*smoothstep(.03,.2,y)*(1.-smoothstep(.75,1.,y)*.5)*(.25+.75*clear); }
        #endif
        { float ca=clamp(acos(clamp(md,-1.,1.))/.030,0.,9.); if(ca<1.){ vec3 rt=normalize(cross(uMoon,vec3(0.,1.,0.))),up=cross(rt,uMoon); vec2 q=vec2(dot(d,rt),dot(d,up))/.030; float nz=sqrt(max(0.,1.-dot(q,q))); float mar=N(q*.16+.3).r*.6+N(q*.45+.1).g*.4; float al=mix(1.,.52,smoothstep(.42,.66,mar))*(.86+.14*N(q*1.3).r); float ph=clamp(dot(vec3(q,nz),normalize(vec3(.35,.25,.9))),0.,1.); c=mix(c,vec3(3.6,3.45,3.1)*al*pow(ph,.55)*(.35+.65*clear),smoothstep(1.,.93,ca)); }
          float hl=max(md,0.); c+=vec3(.55,.62,.85)*(pow(hl,1400.)*.8+pow(hl,180.)*.22+pow(hl,30.)*.07)*(.4+.6*clear); float r22=(acos(clamp(md,-1.,1.))-.384)/.035; c+=vec3(.16,.19,.27)*exp(-r22*r22)*.22*uCloud*(1.-uCloud); }
        gl_FragColor=vec4(max(c,0.),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
    const VS = 'varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
    const fxMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U, vertexShader: VS, fragmentShader: FS, defines: { CLOUDS: 2, AURORA: 24 } });
    const envMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U, vertexShader: VS, fragmentShader: FS.replace(/gl_FragColor=vec4\(max\(c,0\.\),1\.\);/, 'c=mix(c,uHor*.9+uMidF*.3,smoothstep(.02,-.1,d.y)); gl_FragColor=vec4(min(max(c,0.)*.55,vec3(4.)),1.);'), defines: { CLOUDS: 1, AURORA: 8 } });
    const envScene = new THREE.Scene(), envSky = new THREE.Mesh(sky.geometry, envMat); envScene.add(envSky);
    let pm = null, envRT = null, envT = 0, envMood = '', lastEnv = new THREE.Color(9, 9, 9);
    const S = { on: false, mood: '', env: null, cur, s: null, wind: new THREE.Vector3(), gust: 0, forced: null, dist: 0, U };
    const _a = {}, flat = new THREE.Color();
    const sample = (a, b, t) => { for (const c of COLS) cur[c].copy(L[a][c]).lerp(L[b][c], t); for (const n of NUMS) cur[n] = L[a][n] + (L[b][n] - L[a][n]) * t; };
    const env = S.env = { time: 0, moonDir: new THREE.Vector3(-.38, .36, -.85).normalize(), moonCol: new THREE.Color(), mistCol: new THREE.Color(), ground: new THREE.Vector4(), shaft: 1, mist: 1, lampK: 1, dens: 1, bloom: .5, exposure: 1, frost: 0, vig: .34, speed: 0, hit: 0, dof: 1, dofA: 90, dofB: 520 };
    const keep = { hemiI: hemi.intensity, hemiS: hemi.color.clone(), hemiG: hemi.groundColor.clone(), moonI: moon.intensity, moonC: moon.color.clone(), fog: FOG.clone(), near: scene.fog.near, far: scene.fog.far, exp: renderer.toneMappingExposure, glowOp: cityGlow.material.opacity };
    S.configure = (on, s) => {
      S.on = on; S.s = s; sky.material = on ? fxMat : legacyMat;
      if (on) { fxMat.defines.CLOUDS = s.clouds; fxMat.defines.AURORA = s.aurora === 2 ? 26 : s.aurora === 1 ? 9 : 0; fxMat.needsUpdate = true; env.dofA = 90; }
      else { hemi.intensity = keep.hemiI; hemi.color.copy(keep.hemiS); hemi.groundColor.copy(keep.hemiG); moon.intensity = keep.moonI; moon.color.copy(keep.moonC); FOG.copy(keep.fog); scene.background.copy(keep.fog); scene.fog.near = keep.near; scene.fog.far = keep.far; renderer.toneMappingExposure = keep.exp; cityGlow.material.opacity = keep.glowOp; }
      if (!on || !s.refl) { scene.environment = null; if (envRT) { envRT.dispose(); envRT = null; } } else lastEnv.setRGB(9, 9, 9);
    };
    const bake = () => {       // image based light from the same sky
      pm = pm || new THREE.PMREMGenerator(renderer); const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
      const next = pm.fromScene(envScene, .02, 1, 1200); renderer.toneMapping = tm; if (envRT) envRT.dispose(); envRT = next; scene.environment = next.texture;
    };
    S.moodAt = (d, lv, play) => { if (S.forced && L[S.forced]) return [S.forced, S.forced, 0]; if (!S.s || !S.s.weather) return lv === 'tirol' ? ['nordlys', 'nordlys', 0] : ['skumring', 'skumring', 0];
      if (!play) return lv === 'tirol' ? ['nordlys', 'nordlys', 0] : ['natt', 'nordlys', .55];
      const q = SEQ[lv] || SEQ.park, k = Math.floor(d / LEN), t = d - k * LEN; return [q[k % q.length], q[(k + 1) % q.length], Math.max(0, Math.min(1, (t - (LEN - MIX)) / MIX))]; };
    let blend = null;
    S.update = (dt, { dist, lv, play, splash, time, speed, roll }) => {
      if (!S.on) return; const [a, b, t0] = S.moodAt(dist, lv, play), t = t0 * t0 * (3 - 2 * t0);
      sample(a, b, t); S.mood = t < .5 ? a : b; S.mix = t;
      // a mood jump (new run, level switch) glides instead of popping
      if (!blend) { blend = { c: {}, n: {} }; for (const c of COLS) blend.c[c] = cur[c].clone(); for (const n of NUMS) blend.n[n] = cur[n]; }
      const k = 1 - Math.exp(-dt * 2.2); for (const c of COLS) { blend.c[c].lerp(cur[c], k); cur[c].copy(blend.c[c]); } for (const n of NUMS) { blend.n[n] += (cur[n] - blend.n[n]) * k; cur[n] = blend.n[n]; }
      S.gust = .5 + .5 * Math.sin(time * .31) * Math.sin(time * .83 + 1.3) + .25 * Math.max(0, Math.sin(time * 2.1)) * Math.min(1, cur.wind); const w = cur.wind * (.55 + .75 * S.gust);
      S.wind.set(w * 3.4, 0, w * 1.4); U.uWind.value.set(1 + cur.wind, .4);
      U.uStar.value = cur.star; U.uCloud.value = cur.cloud; U.uGk.value = cur.gk; U.uWk.value = cur.wk; U.uAurK.value = cur.aur * (S.s.aurora ? 1 : 0);
      const pulse = .85 + .15 * Math.sin(time * .4);
      FOG.copy(cur.hor); scene.background.copy(cur.hor); const dr = S.s.draw; scene.fog.near = -cur.near * (splash ? 1.2 : 1); scene.fog.far = Math.max(150, Math.min(310, cur.far * dr)) * (splash ? 1.5 : 1);
      hemi.color.copy(cur.sky); hemi.groundColor.copy(cur.gnd); hemi.intensity = cur.hi * (scene.environment ? .5 : .8); moon.color.copy(cur.key); moon.intensity = cur.ki * .72;
      if (cur.aur > .01) { hemi.color.lerp(flat.setRGB(.25, .8, .55), cur.aur * .22 * pulse); }
      renderer.toneMappingExposure = cur.exp;
      env.time = time; env.exposure = cur.exp * .96; env.moonCol.copy(cur.key).multiplyScalar(cur.ki * .018 * (splash ? .4 : 1)); if (splash) { hemi.intensity *= .62; moon.intensity *= .62; env.exposure *= .92; } env.mistCol.copy(cur.hor).multiplyScalar(.9).lerp(cur.sky, .25); env.shaft = cur.shaft; env.mist = cur.mist * (splash ? .3 : 1); env.lampK = .75 + cur.mist * .25;
      env.frost = Math.max(0, Math.min(1, (cur.snow - 1) * .9)) * .55; env.bloom = .42; cityGlow.material.opacity = .22 * cur.gk;
      env.speed = speed; env.dofA = splash ? 26 : 110; env.dofB = splash ? 70 : 560;
      if (S.s.refl) { envT -= dt; if (envT <= 0) { envT = 1.2; const e = Math.abs(lastEnv.r - cur.hor.r) + Math.abs(lastEnv.g - cur.mid.g) + Math.abs(lastEnv.b - cur.sky.b); if (e > .05 || !envRT) { lastEnv.setRGB(cur.hor.r, cur.mid.g, cur.sky.b); bake(); } } }
    };
    S.dispose = () => { fxMat.dispose(); envMat.dispose(); if (envRT) envRT.dispose(); if (pm) pm.dispose(); };
    S.moods = Object.keys(M); S.resetBlend = () => { blend = null; };
    return S;
  };
})();
