/* SnowFX Extreme – glue: owns the modules, patches the game's materials and runs once per frame.
   The game calls create() once, then update()/render(). If anything fails, the old renderer takes over. */
(() => {
  const NS = window.SNOWFX = window.SNOWFX || {};
  NS.create = ctx => {
    const { THREE, renderer, scene, camera, SMAAPass, isTouch, isIOS, moon, lampLights, snowU, ptUniforms, override } = ctx;
    const gl = renderer.getContext(); let gpu = ''; try { const e = gl.getExtension('WEBGL_debug_renderer_info'); gpu = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) {}
    const C = NS.createConfig({ gpu, isTouch, isIOS, override });
    NS.installFog(THREE);
    const noiseTex = NS.makeNoise(THREE, 256, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    const F = { C, on: !C.legacy(), gen: 1, failed: null, patched: [], noiseTex };

    /* material patching: one dispatcher, two versions. The cache key follows the mode, so a switch recompiles exactly what changed. */
    F.patch = (m, legacy, fx) => { if (m.userData.sfx) return m; m.userData.sfx = true; const old = legacy || m.onBeforeCompile; m.onBeforeCompile = function (sh, r) { if (F.on) fx(sh, r); else if (old) old.call(this, sh, r); }; const id = F.patched.length; m.customProgramCacheKey = () => (F.on ? 'fx' + F.gen : 'lg') + '|' + (F.on ? fx.toString() : String(old)).length + '|' + id; F.patched.push(m); m.needsUpdate = true; return m; };

    const pipe = F.pipe = NS.createPipeline({ THREE, renderer, scene, camera, SMAAPass, noiseTex, isIOS, isTouch, moon, lamps: lampLights });
    const snow = F.snow = NS.createSnow({ THREE, renderer, noiseTex, snowU, pipe });
    const sky = F.sky = NS.createSky({ THREE, renderer, scene, camera, sky: ctx.sky, FOG: ctx.FOG, noiseTex, moon, snowU, cityGlow: ctx.cityGlow });
    const parts = F.parts = NS.createParticles({ THREE, renderer, scene, camera, noiseTex, snowU, ptUniforms, pipe });
    const world = F.world = NS.createWorld(Object.assign({}, ctx, { noiseTex, snow, patch: F.patch, salt: ctx.salt, lv: ctx.lv }));

    F.patchAll = M => {
      F.patch(M.snow, M.snow.onBeforeCompile, sh => snow.compile(sh));
      F.patch(M.chunk, M.vc.onBeforeCompile, sh => world.compileStatic(sh, false));
      F.patch(M.house, M.vc.onBeforeCompile, sh => world.compileStatic(sh, true));
      F.patch(M.vc, M.vc.onBeforeCompile, sh => world.compileCloth(sh, { fuzz: '.45', weave: '.55' }));
      F.patch(M.knit, null, sh => world.compileCloth(sh, { fuzz: '.9', weave: '.9' }));
      F.patch(M.ice, null, sh => snow.compileIce(sh, false)); F.patch(M.creek, null, sh => snow.compileIce(sh, false)); F.patch(M.loop, null, sh => snow.compileIce(sh, true));
      F.patch(M.coin, null, sh => world.compileCloth(sh, { snow: '0.', fuzz: '.2', weave: '.4' }));
    };
    F.patchTree = m => F.patch(m, m.onBeforeCompile, sh => world.compileTree(sh));
    F.patchProp = (m, o) => F.patch(m, m.onBeforeCompile, sh => world.compileCloth(sh, o || { s1: '2.2', s2: '9.0', fuzz: '.5', weave: '.5' }));
    F.patchBridge = m => F.patch(m, m.onBeforeCompile, sh => world.compileBridge(sh));
    F.patchGround = m => { const lg = m.onBeforeCompile; m.defines = Object.assign(m.defines || {}, { SNOW_FREE: 1 }); return F.patch(m, lg, sh => snow.compile(sh)); };

    let W = innerWidth, H = innerHeight, govScale = 1;
    const pr = () => { const s = C.s; return Math.max(.35, Math.min(devicePixelRatio || 1, isTouch ? Math.min(s.dpr, 1.75) : s.dpr) * s.res * govScale); };
    F.resize = (w, h) => { W = w; H = h; const p = pr(); renderer.setPixelRatio(p); renderer.setSize(W, H, false); if (F.on) { try { pipe.configure(W, H, p, C.s); } catch (e) { F.fail('oppsett', e); } } ctx.onResize(p, W, H); };
    const gov = F.gov = NS.createGovernor(C, { applyScale: v => { govScale = v; F.resize(W, H); }, canSwitch: () => ctx.state() !== 'play', onNote: t => ctx.toast('SnowFX', t) });

    const shadows = () => {
      const s = C.s, sz = [0, 1024, 2048, 3072, 4096][s.shadow]; moon.castShadow = s.shadow > 0;
      if (s.shadow) { const want = F.on ? Math.min(sz, renderer.capabilities.maxTextureSize) : (isTouch ? 1024 : 2048); if (moon.shadow.mapSize.x !== want) { moon.shadow.mapSize.set(want, want); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } } const c = moon.shadow.camera, d = F.on ? s.shadowDist : 22; c.left = -d; c.right = d; c.top = F.on ? d * 1.35 : 26; c.bottom = F.on ? -d * .75 : -18; c.far = F.on ? 130 : 110; c.updateProjectionMatrix(); moon.shadow.bias = F.on ? -.0004 : -.0006; moon.shadow.normalBias = F.on ? .06 : .05; F.texel = 2 * d / moon.shadow.mapSize.x; }
    };
    const aniso = () => { const a = [1, 4, 16][C.s.tex], mx = renderer.capabilities.getMaxAnisotropy(); for (const t of ctx.textures()) { const v = Math.min(a, mx); if (t && t.anisotropy !== v) { t.anisotropy = v; t.needsUpdate = true; } } const na = Math.min([1, 2, C.s.snow > 2 ? 4 : 3][C.s.tex], mx); if (noiseTex.anisotropy !== na) { noiseTex.anisotropy = na; noiseTex.needsUpdate = true; } };
    F.apply = ch => {
      const was = F.on, s = C.s; F.on = !C.legacy() && !F.failed;
      const matKeys = ['snow', 'deform', 'refl', 'shadow']; const recompile = was !== F.on || ch === null || [...ch].some(k => matKeys.includes(k));
      if (recompile) { F.gen++; for (const m of F.patched) m.needsUpdate = true; }
      sky.configure(F.on, s); snow.configure(F.on, s); parts.configure(F.on, s); world.configure(F.on, s); shadows(); aniso();
      ctx.onMode(F.on, s, ch); F.resize(innerWidth, innerHeight);
      if (F.on && ch === null && !pipe.probe()) { pipe.safe = 1; pipe.key = ''; F.resize(innerWidth, innerHeight); if (!pipe.probe()) F.fail('rendermål'); }
      gov.reset();
    };
    C.listeners.push(ch => F.apply(ch));

    /* fallbacks: a shader that will not compile or a black picture drops to something simpler and says so in the console */
    renderer.debug.onShaderError = (g, prog, vs, fs) => { const log = (g.getShaderInfoLog(vs) || '') + (g.getShaderInfoLog(fs) || ''), src = g.getShaderSource(fs) || ''; const m = /ERROR: 0:(\d+)/.exec(log); console.error('[SnowFX] shader', log, m ? src.split('\n').slice(Math.max(0, m[1] - 3), +m[1] + 2).join('\n') : ''); if (F.on) setTimeout(() => F.fail('shader', log), 0); };
    F.fail = (why, e) => { if (F.failed) return; F.failed = why; console.warn('[SnowFX] slått av:', why, e || ''); pipe.dispose(); pipe.key = ''; F.apply(null); ctx.toast('Grafikk', 'Bruker den enkle varianten'); };
    F.black = () => { F.blackN = (F.blackN || 0) + 1; console.warn('[SnowFX] svart bilde, trinn', F.blackN); if (F.blackN === 1) { pipe.key = ''; F.resize(W, H); } else if (F.blackN === 2) { pipe.safe = 1; pipe.key = ''; F.resize(W, H); } else F.fail('svart bilde'); };

    renderer.domElement.addEventListener('webglcontextrestored', () => { console.warn('[SnowFX] GL-kontekst gjenopprettet'); pipe.key = ''; snow.def.reset(); gov.reset(); F.resize(innerWidth, innerHeight); });   // three re-uploads textures; our targets are rebuilt here
    const snap = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    F.snapShadow = () => { if (!F.on || !F.texel) return; _f.subVectors(moon.position, moon.target.position).normalize(); _r.crossVectors(UP, _f).normalize(); _u.crossVectors(_f, _r); const t = moon.target.position, a = t.dot(_r), b = t.dot(_u), da = Math.round(a / F.texel) * F.texel - a, db = Math.round(b / F.texel) * F.texel - b; t.addScaledVector(_r, da).addScaledVector(_u, db); moon.position.addScaledVector(_r, da).addScaledVector(_u, db); };

    /* ---- gameplay read-only effects: spray, tracks, landings, breath, smoke ---- */
    const E = { z: null, lat: 0, air: false, landT: -9, breath: 1, smoke: 0, gust: 0, tr: new Map(), step: 0, lean: 0, leanV: 0, land: 0, landV: 0 }, rnd = (a, b) => a + Math.random() * (b - a), v = new THREE.Vector3(), v2 = new THREE.Vector3();
    const FOOT = new Map();
    F.fx = (dt, g) => {
      if (!F.on || dt <= 0) return; const { P, G } = g, T = G.T, D = snow.def, play = g.state === 'play' || g.state === 'over', title = g.state === 'title' && g.splash; if (title) { E.z = null; breath(dt, g, true); return; }
      const ground = !P.air && !P.loop && P.h < .05;
      if (E.z !== null && Math.abs(E.z - P.z) < 6 && E.z > P.z) {
        if (ground && !E.air) for (const o of [-.31, .31]) D.line(E.lat + o, E.z, P.lat + o, P.z, .085, .95, .55);
        if (ground && Math.abs(P.latV) > 3) D.line(E.lat, E.z, P.lat, P.z, .3, .35, .5);                                    // the sled skids sideways and scrapes the top
      }
      // powder behind the runners: more with speed, thrown outwards in turns
      if (ground && P.speed > 5) { const sp = Math.min(1.6, P.speed / 24), turn = Math.min(1, Math.abs(P.latV) / 9); const dirz = P.speed;
        for (const sd of [-1, 1]) { g.wpos(P.lat + sd * .33, P.z + .55, .04, v); const k = turn > .1 ? (Math.sign(P.latV) === sd ? .4 : 1.8) : 1; parts.powder(v.x, v.y, v.z, sd * (.5 + sp * .9) - P.latV * .42, .9 + sp * 1.1 + turn * 1.6, -dirz * .34, dt * (40 + 90 * turn) * sp * k, .6 + turn * .9, .26 + sp * .16 + turn * .18, .85, .72 + .2 * turn);
          if (Math.random() < dt * (8 + 34 * turn) * sp * Math.min(1, parts.k)) parts.emit(1, v.x, v.y, v.z, sd * rnd(.5, 2.4) - P.latV * .5, rnd(1.2, 3.2), -dirz * rnd(.3, .6), rnd(.4, .8), rnd(.012, .032), .95, .92, .96, 1, .8); }
        if (P.braking) { g.wpos(P.lat, P.z - .7, .05, v); parts.powder(v.x, v.y, v.z, 0, 2.4, -dirz * .5, dt * 120, 1.8, .42, .9, .5); } }
      if (P.landT !== E.landT) { const dh = P.landT === T || T - P.landT < .05; E.landT = P.landT; if (dh && play && P.landT > 0) { g.wpos(P.lat, P.z, .05, v); parts.boom(v.x, v.y, v.z, .9 + Math.min(1, P.airT || 0), 26); parts.chips(v.x, v.y, v.z, 14, 2.6, 4); D.crater(P.lat, P.z, .75, .8); E.landV -= 1.6 + Math.min(2.2, (P.airT || 0) * 2); } }
      if (P.rocketT > 0 && Math.random() < dt * 40) { g.wpos(P.lat, P.z + 1.2, P.h + .2, v); parts.emit(2, v.x, v.y, v.z, rnd(-.5, .5), rnd(0, .6), rnd(2, 5), rnd(.7, 1.3), rnd(.25, .5), .4, .55, .52, .6, 1.4); }
      E.z = P.z; E.lat = P.lat; E.air = !ground;
      // the others leave tracks too
      const tr = (key, u, z, offs, w, str) => { const l = E.tr.get(key); if (l && Math.abs(l.z - z) < 5) for (const o of offs) D.line(l.u + o, l.z, u + o, z, w, str, .5); if (l) { l.u = u; l.z = z; } else E.tr.set(key, { u, z }); };
      for (const r of g.runners) { if (r.active && r.state === 'ride') { tr(r, r.lat, r.z, [-.39, .39], .10, .9); const d = P.z - r.z; if (d > -3 && d < 55 && Math.random() < dt * 22) { g.wpos(r.lat + rnd(-.4, .4), r.z + .8, .05, v); parts.powder(v.x, v.y, v.z, rnd(-.6, .6), 1.1, -(r.v || P.speed) * .3, 1, .5, .24, .6, .28); } } else E.tr.delete(r); }
      for (const t of g.teams) if (t.active !== false) { tr(t, t.u !== undefined ? t.u : g.laneU(t.lane, t.z), t.z + 5, [-.5, .5], .13, 1); if (Math.random() < dt * 30) { g.wpos(g.laneU(t.lane, t.z) + rnd(-.9, .9), t.z - rnd(0, 5), .05, v); parts.powder(v.x, v.y, v.z, rnd(-1, 1), 1.4, 3, 1, .8, .32, .7, .34); } }
      for (const m of g.groomers) tr(m, m.u, m.z, [-.8, .8], .34, .8);
      { const c = g.chaser; if (c && c.root.visible && c.lat !== undefined) tr(c, c.lat, g.P.z + c.gap, [-.3, .3], .16, .9); }                                   // the keeper's scooter
      E.gust -= dt; if (E.gust <= 0) { E.gust = rnd(.5, 1.6) / Math.max(.3, sky.cur.wind); const t = g.nearTree(); if (t) { parts.powder(t.x + rnd(-1, 1), t.y + rnd(2.5, 5), t.z + rnd(-1, 1), sky.wind.x * .3, -.2, sky.wind.z * .3, 12, .5, .3, 1.8, .34); } }   // a load of snow slips off a branch
      breath(dt, g, false); smoke(dt, g);
    };
    const breath = (dt, g, title) => { E.breath -= dt; if (E.breath > 0) return; E.breath = title ? 2.6 : 1.5; const { P } = g; if (title) { const q = g.splashKid; if (q) for (let i = 0; i < 5; i++) parts.emit(2, q.x + rnd(-.05, .05), q.y + rnd(-.03, .05), q.z, rnd(-.1, .3), rnd(.1, .25), rnd(.2, .5), rnd(1.2, 2), rnd(.10, .2), .16, .9, .94, 1, 1.5); return; }
      if (P.loop || g.state === 'over') return; g.wpos(P.lat, P.z - .45, P.h + 1.05, v); for (let i = 0; i < 4; i++) parts.emit(2, v.x + rnd(-.06, .06), v.y + rnd(-.04, .06), v.z, rnd(-.2, .2), rnd(.1, .4), -P.speed * rnd(.55, .75), rnd(.5, .9), rnd(.10, .17), .14, .9, .94, 1, 2.4);
      for (const r of g.runners) if (r.active && r.state === 'ride' && P.z - r.z < 40 && P.z > r.z) { g.wpos(r.lat, r.z - .4, 1.35, v); for (let i = 0; i < 3; i++) parts.emit(2, v.x, v.y, v.z, rnd(-.2, .2), rnd(.1, .4), -P.speed * rnd(.5, .7), rnd(.5, 1), rnd(.12, .2), .15, .9, .94, 1, 2); } };
    const smoke = (dt, g) => { E.smoke -= dt; if (E.smoke > 0) return; E.smoke = .16 / Math.max(.4, Math.min(1.5, parts.k)); for (const c of g.chunks) if (c.chim) for (const q of c.chim) { const d = g.P.z - q.z; if (d > -8 && d < 120 && Math.random() < .5) parts.emit(2, q.x + rnd(-.12, .12), q.y, q.z + rnd(-.12, .12), rnd(-.15, .15) + sky.wind.x * .15, rnd(.8, 1.4), rnd(-.15, .15), rnd(3, 4.6), rnd(.4, .7), .26, .62, .64, .74, .5); } };
    F.impact = (p, r, u, z) => { if (!F.on) return; parts.boom(p.x, p.y + .1, p.z, r, 12 + r * 14); parts.chips(p.x, p.y + .1, p.z, 10 + r * 8, 2 + r * 1.5, 3 + r * 2, .035); if (u !== undefined) snow.def.crater(u, z, .28 + r * .35, 1); };
    F.hit = (p, n = 10) => { if (!F.on) return; parts.chips(p.x, p.y, p.z, n, 3.2, 3.4, .045); };
    F.puff = p => {};

    let cpu = 4;
    F.update = (dt, rdt, g) => {
      if (!F.on) { parts.update(dt, g.G.T, sky, 1, 1, 1); return; }
      const p = pr(); const splash = g.splash; sky.update(rdt, { dist: g.G.dist, lv: ctx.lv(), play: g.state !== 'title', splash, time: g.G.T, speed: g.speedK });
      const U = snow.U; U.uT.value = g.G.T; U.uKeyD.value.copy(ctx.MOON_OFF).normalize(); U.uKeyC.value.copy(sky.cur.key).multiplyScalar(sky.cur.ki); U.uSkyC.value.copy(sky.cur.sky).multiplyScalar(sky.cur.hi); U.uPM.value.copy(camera.projectionMatrix); parts.U.uKeyD.value.copy(U.uKeyD.value); world.U.uSnowK.value = Math.min(1, .25 + g.G.dist / 1800 + Math.max(0, sky.cur.snow - 1) * .3) * (splash ? .6 : 1);
      const env = sky.env; env.hit = g.hit; env.vig = .30; const gz = splash ? camera.position.z : g.P.z - 10; env.ground.set(g.groundY(splash, gz), gz, splash ? 0 : g.slope, 0); env.lampK = (.75 + sky.cur.mist * .25);
      ctx.snowCount(splash ? 0 : Math.min(1, .16 + sky.cur.snow * .5) * Math.min(1, .35 + C.s.part * .65));
      snowU.uRush.value.x += sky.wind.x * dt * .55; snowU.uRush.value.z += sky.wind.z * dt * .3; snowU.uRushN.value.x += sky.wind.x * dt * .8;
      if (!splash) parts.ground(g.P.z, g.cx, g.gY);
      F.fx(dt, g); parts.update(dt, g.G.T, sky, p, Math.floor(W * p), Math.floor(H * p)); snow.def.flush(g.P.z); world.update(rdt, g.G.T, sky, ctx.lv(), sky.wind, g.P.z);
      // visual-only body language: lean spring, vibration
      const kk = 70, cc = 11; E.leanV += ((-g.P.latV * .022 - E.lean) * kk - E.leanV * cc) * Math.min(rdt, .03); E.lean += E.leanV * Math.min(rdt, .03); E.landV += (-E.land * 120 - E.landV * 13) * Math.min(rdt, .03); E.land += E.landV * Math.min(rdt, .03); F.lean = Math.max(-.4, Math.min(.4, E.lean)); F.land = Math.max(-.3, Math.min(.3, E.land));
      F.snapShadow();
    };
    F.render = (rdt) => { const t0 = performance.now(); try { pipe.render(sky.env, rdt); } catch (e) { F.fail('tegning', e); return false; } cpu = cpu * .9 + (performance.now() - t0) * .1; gov.gpuMs = pipe.gpuMs; return true; };
    F.frameMs = 16;
    F.frame = (ms, playing) => { F.frameMs = F.frameMs * .9 + Math.min(ms, 200) * .1; gov.frame(ms, playing); UI && UI.tick(ms / 1000); };
    F.reset = () => { snow.def.reset(); parts.reset(); pipe.cut(); E.z = null; E.tr.clear(); };
    F.terr = () => !F.on ? 0 : C.s.terr;
    F.stats = () => ({ fps: 1000 / F.frameMs, ms: F.frameMs, cpu: F.cpuMs || cpu, gpu: pipe.hasTimer && F.on ? pipe.gpuMs : null, draws: F.on && pipe.stats ? pipe.stats.draws : renderer.info.render.calls, all: F.on && pipe.stats ? pipe.stats.allDraws : renderer.info.render.calls, tris: F.on && pipe.stats ? pipe.stats.tris : renderer.info.render.triangles, tex: renderer.info.memory.textures, geo: renderer.info.memory.geometries, prog: renderer.info.programs.length, part: F.on ? parts.count() : 0, mem: F.on ? pipe.memory() : 0, w: renderer.domElement.width, h: renderer.domElement.height, scale: govScale, profile: NS.PRESETS[C.preset].label + (Object.keys(C.over).some(k => C.s[k] !== NS.PRESETS[C.preset].s[k]) ? ' (tilpasset)' : ''), auto: C.auto, mood: F.on ? sky.mood : '–', fx: F.on ? pipe.active.join(' · ') : 'opprinnelig renderer' });
    const UI = F.ui = NS.createUI({ C, gov, getStats: F.stats, isTouch, onOpen: o => ctx.onMenu && ctx.onMenu(o) });
    return F;
  };
})();
