/* SnowFX Extreme – graphics profiles, settings storage and the adaptive quality governor.
   Classic scripts on window.SNOWFX (no modules): works on GitHub Pages, as an artifact and from file://. */
(() => {
  const NS = window.SNOWFX = window.SNOWFX || {};

  /* every setting the menu can control: [key, label, group, options [[value, text], ...]] */
  const OPT = {
    onoff: [[0, 'Av'], [1, 'På']],
    q3: [[0, 'Av'], [1, 'Lav'], [2, 'Middels'], [3, 'Høy']],
  };
  NS.SETTINGS = [
    ['res', 'Renderoppløsning', 'Bilde', [[.5, '50 %'], [.67, '67 %'], [.8, '80 %'], [1, '100 %'], [1.25, '125 %']]],
    ['dpr', 'Pikselforhold (maks)', 'Bilde', [[1, '1,0'], [1.25, '1,25'], [1.5, '1,5'], [1.75, '1,75'], [2, '2,0']]],
    ['adaptive', 'Adaptiv oppløsning', 'Bilde', OPT.onoff],
    ['fps', 'Mål for bildefrekvens', 'Bilde', [[30, '30 FPS'], [60, '60 FPS']]],
    ['aa', 'Antialiasing', 'Bilde', [[0, 'Av'], [1, 'FXAA'], [2, 'SMAA'], [3, 'MSAA 4x'], [4, 'MSAA 4x + SMAA']]],
    ['tex', 'Teksturkvalitet', 'Materialer', [[0, 'Lav'], [1, 'Middels'], [2, 'Høy']]],
    ['snow', 'Snødetaljer', 'Materialer', OPT.q3],
    ['deform', 'Spor i snøen', 'Materialer', [[0, 'Av'], [1, 'Lav'], [2, 'Høy']]],
    ['refl', 'Refleksjoner', 'Materialer', [[0, 'Av'], [1, 'Miljø'], [2, 'Miljø + skjermrom']]],
    ['shadow', 'Skyggekvalitet', 'Lys', [[0, 'Av'], [1, 'Lav'], [2, 'Middels'], [3, 'Høy'], [4, 'Maks']]],
    ['shadowDist', 'Skyggeavstand', 'Lys', [[18, '18 m'], [26, '26 m'], [36, '36 m'], [48, '48 m']]],
    ['ao', 'Omgivelsesskygge (GTAO)', 'Lys', OPT.q3],
    ['contact', 'Kontaktskygger', 'Lys', OPT.onoff],
    ['vol', 'Volumetrisk lys', 'Lys', OPT.q3],
    ['fog', 'Volumetrisk tåke', 'Atmosfære', [[0, 'Av'], [1, 'Enkel'], [2, 'Full']]],
    ['clouds', 'Skykvalitet', 'Atmosfære', OPT.q3],
    ['aurora', 'Nordlys', 'Atmosfære', [[0, 'Av'], [1, 'Enkelt'], [2, 'Fullt']]],
    ['weather', 'Dynamisk vær', 'Atmosfære', OPT.onoff],
    ['part', 'Partikkeltetthet', 'Verden', [[.25, '25 %'], [.5, '50 %'], [1, '100 %'], [1.5, '150 %'], [2, '200 %']]],
    ['veg', 'Vegetasjonstetthet', 'Verden', [[0, 'Av'], [.5, '50 %'], [1, '100 %'], [1.5, '150 %']]],
    ['terr', 'Terrengdetaljer', 'Verden', [[0, 'Lav'], [1, 'Middels'], [2, 'Høy']]],
    ['draw', 'Synsvidde', 'Verden', [[.75, 'Kort'], [1, 'Normal'], [1.3, 'Lang']]],
    ['lod', 'Detaljnivå på avstand', 'Verden', [[.6, 'Lavt'], [1, 'Normalt'], [1.6, 'Høyt']]],
    ['bloom', 'Bloom', 'Film', [[0, 'Av'], [.6, 'Svak'], [1, 'Normal'], [1.35, 'Kraftig']]],
    ['mblur', 'Bevegelsesuskarphet', 'Film', [[0, 'Av'], [.5, 'Svak'], [1, 'Normal']]],
    ['dof', 'Dybdeuskarphet', 'Film', OPT.onoff],
    ['grade', 'Fargegradering (LUT)', 'Film', OPT.onoff],
    ['lens', 'Linseeffekter og filmkorn', 'Film', OPT.onoff],
    ['shake', 'Kamerabevegelse', 'Kamera', [[0, 'Av'], [.5, 'Redusert'], [1, 'Full']]],
  ];
  const P = (o) => o;
  const base = { res: 1, dpr: 1.5, adaptive: 1, fps: 60, aa: 3, tex: 2, snow: 2, deform: 2, refl: 1, shadow: 3, shadowDist: 26, ao: 2, contact: 1, vol: 2, fog: 2, clouds: 2, aurora: 2, weather: 1, part: 1, veg: 1, terr: 1, draw: 1, lod: 1, bloom: 1, mblur: 1, dof: 1, grade: 1, lens: 1, shake: 1 };
  const mk = o => Object.assign({}, base, o);
  /* 'original' and 'potato' run the old v32 renderer (legacy: true): the SnowFX materials and passes are switched off. */
  NS.PRESETS = {
    original: { label: 'Original', legacy: true, s: mk({ dpr: 1.75, aa: 3, snow: 0, deform: 0, refl: 0, ao: 0, contact: 0, vol: 0, fog: 0, clouds: 0, aurora: 1, weather: 0, part: 1, veg: 0, terr: 0, mblur: 0, dof: 0, shadow: 2 }) },
    potato: { label: 'Potet', legacy: true, s: mk({ res: .67, dpr: 1, fps: 30, aa: 0, tex: 0, snow: 0, deform: 0, refl: 0, ao: 0, contact: 0, vol: 0, fog: 0, clouds: 0, aurora: 0, weather: 0, part: .25, veg: 0, terr: 0, draw: .75, lod: .6, bloom: 0, mblur: 0, dof: 0, grade: 0, lens: 0, shadow: 0 }) },
    low: { label: 'Lav', s: mk({ res: .8, dpr: 1, fps: 60, aa: 1, tex: 0, snow: 1, deform: 1, refl: 0, shadow: 1, shadowDist: 18, ao: 0, contact: 0, vol: 0, fog: 1, clouds: 1, aurora: 1, part: .5, veg: .5, terr: 0, draw: .75, lod: .6, bloom: .6, mblur: 0, dof: 0, lens: 0 }) },
    medium: { label: 'Middels', s: mk({ dpr: 1, aa: 1, tex: 1, snow: 2, deform: 1, refl: 1, shadow: 2, shadowDist: 26, ao: 1, contact: 0, vol: 1, fog: 1, clouds: 1, aurora: 1, part: .5, veg: .5, terr: 1, mblur: .5, dof: 0 }) },
    high: { label: 'Høy', s: mk({ dpr: 1.25, aa: 2, vol: 2, refl: 1, shadow: 3, ao: 2 }) },
    ultra: { label: 'Ultra', s: mk({ dpr: 1.5, aa: 3, snow: 3, vol: 2, refl: 2, shadow: 3, shadowDist: 36, ao: 2, clouds: 2, part: 1.5, terr: 2, lod: 1 }) },
    extreme: { label: 'Extreme', s: mk({ dpr: 2, aa: 4, snow: 3, vol: 3, refl: 2, shadow: 4, shadowDist: 36, ao: 3, clouds: 3, part: 2, veg: 1.5, terr: 2, draw: 1.3, lod: 1.6 }) },
    cinematic: { label: 'Cinematic', s: mk({ res: 1.25, dpr: 2, adaptive: 0, fps: 30, aa: 4, snow: 3, vol: 3, refl: 2, shadow: 4, shadowDist: 48, ao: 3, clouds: 3, part: 2, veg: 1.5, terr: 2, draw: 1.3, lod: 1.6 }) },
  };
  NS.PRESET_ORDER = ['original', 'potato', 'low', 'medium', 'high', 'ultra', 'extreme', 'cinematic'];
  const AUTO_LADDER = ['low', 'medium', 'high', 'ultra'];

  const KEY = 'sj_gfx';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  const write = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };

  /* first guess from the hardware: the governor corrects it from real frame times afterwards */
  NS.guess = (gpu, isTouch, isIOS, w, h) => {
    if (/SwiftShader|llvmpipe|Software|Microsoft Basic|ANGLE \(Software/i.test(gpu)) return 'potato';
    if (isIOS || isTouch) return Math.min(w, h) >= 700 && isIOS ? 'medium' : (navigator.hardwareConcurrency || 4) >= 6 ? 'medium' : 'low';
    if (/Apple M\d+ (Max|Ultra)|RTX|RX (6[789]|7|9)|Radeon Pro/i.test(gpu)) return 'ultra';
    if (/Apple M\d|GTX 1[06]|RX 5|Arc/i.test(gpu)) return 'high';
    if (/Intel|UHD|HD Graphics|Iris/i.test(gpu)) return 'low';
    return 'medium';
  };

  NS.createConfig = ({ gpu, isTouch, isIOS, override }) => {
    const C = { preset: 'high', auto: true, s: {}, custom: false, listeners: [], gpu };
    const saved = load(), reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const guess = NS.guess(gpu || '', isTouch, isIOS, innerWidth, innerHeight);
    const pre = override && NS.PRESETS[override] ? override : saved && NS.PRESETS[saved.preset] ? saved.preset : guess;
    C.guess = guess; C.preset = pre; C.auto = override ? false : saved ? saved.auto !== false : true;
    C.s = Object.assign({}, NS.PRESETS[pre].s, saved && !override ? saved.over || {} : {});
    if (!saved && reduce) { C.s.shake = 0; C.s.mblur = 0; }
    C.over = saved && !override ? Object.assign({}, saved.over) : (!saved && reduce ? { shake: 0, mblur: 0 } : {});
    C.legacy = () => !!NS.PRESETS[C.preset].legacy;
    C.save = () => { if (!override) write({ v: 1, preset: C.preset, auto: C.auto, over: C.over }); };
    const fire = changed => { for (const f of C.listeners) f(changed); };
    C.setPreset = (name, { user = true, keepOver = false } = {}) => {
      if (!NS.PRESETS[name]) return;
      const old = Object.assign({}, C.s); C.preset = name; if (!keepOver) C.over = C.over.shake !== undefined ? { shake: C.over.shake } : {};
      C.s = Object.assign({}, NS.PRESETS[name].s, C.over); if (user) C.auto = false;
      C.save(); const ch = new Set(Object.keys(C.s).filter(k => C.s[k] !== old[k])); ch.add('preset'); fire(ch);
    };
    C.set = (k, v) => { if (C.s[k] === v) return; C.s[k] = v; C.over[k] = v; C.save(); fire(new Set([k])); };
    C.setAuto = on => { C.auto = on; if (on) C.setPreset(guess, { user: false }); else C.save(); fire(new Set(['auto'])); };
    C.step = dir => { const i = AUTO_LADDER.indexOf(C.preset), j = Math.max(0, Math.min(AUTO_LADDER.length - 1, i + dir)); if (i < 0 || j === i) return false; C.setPreset(AUTO_LADDER[j], { user: false, keepOver: true }); return true; };
    C.atBottom = () => AUTO_LADDER.indexOf(C.preset) <= 0;
    return C;
  };

  /* ---- adaptive quality: resolution first, then whole profiles. Hysteresis: it must be bad for a while before
     anything drops, good for much longer before it climbs, and a climb that failed locks climbing out for a minute. */
  NS.createGovernor = (C, { applyScale, canSwitch, onNote }) => {
    const G = { scale: 1, min: .6, ema: 16, win: [], badT: 0, goodT: 0, veryBadT: 0, lockT: 0, lastUp: -99, t: 0, hold: 2, gpuMs: null, pending: 0 };
    const p75 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length * .75)] || 0; };
    const setScale = v => { v = Math.max(G.min, Math.min(1, Math.round(v * 20) / 20)); if (v === G.scale) return false; G.scale = v; applyScale(v); return true; };
    G.reset = () => { G.win.length = 0; G.badT = G.goodT = G.veryBadT = 0; G.hold = 1.5; };
    G.frame = (ms, playing) => {
      if (!(ms > 0) || ms > 250 || document.hidden) { G.reset(); return; }        // tab switch, breakpoint: not a frame
      G.ema = G.ema * .95 + ms * .05; const s = ms / 1000; G.t += s;
      if (G.hold > 0) { G.hold -= s; return; }
      if (!playing || !C.s.adaptive) { if (G.pending && canSwitch()) { G.pending = 0; C.step(-1); G.reset(); } return; }
      G.win.push(ms); if (G.win.length > 90) G.win.shift(); if (G.win.length < 60) return;
      const want = 1000 / C.s.fps, q = p75(G.win);
      const load = G.gpuMs && G.gpuMs < q * 1.15 ? Math.max(G.gpuMs, 0) / want : null;                   // only a measured GPU time counts as headroom
      if (q > want * 1.18) { G.badT += s; G.goodT = 0; } else { G.badT = Math.max(0, G.badT - s * 2); G.goodT += s; }
      G.veryBadT = q > 45 ? G.veryBadT + s : 0;
      if (G.badT > 1.6) {
        G.badT = 0; if (G.t - G.lastUp < 10) G.lockT = G.t + 60;
        if (!setScale(G.scale - (q > want * 1.6 ? .15 : .1)) && C.auto && !C.legacy() && !C.atBottom()) {
          if (canSwitch() || G.veryBadT > 3) { C.step(-1); onNote && onNote('Grafikk: ' + NS.PRESETS[C.preset].label); setScale(.8); } else G.pending = 1;   // a profile switch recompiles shaders: wait for a menu
        }
        G.reset();
      } else if (G.goodT > 8 && G.t > G.lockT && G.scale < 1 && (load === null || load < .7)) { G.goodT = 0; G.lastUp = G.t; setScale(G.scale + .05); G.hold = .5; }
      else if (G.goodT > 25 && C.auto && G.scale >= 1 && G.t > G.lockT && load !== null && load < .45) G.wantUp = true;
      if (G.wantUp && canSwitch()) { G.wantUp = false; if (NS.PRESET_ORDER.indexOf(C.preset) < NS.PRESET_ORDER.indexOf('ultra')) C.step(1); G.reset(); }
    };
    return G;
  };
})();
