/* SnowFX Extreme – graphics menu and performance overlay. */
(() => {
  const NS = window.SNOWFX = window.SNOWFX || {};
  NS.createUI = ({ C, gov, getStats, onOpen, isTouch }) => {
    const css = document.createElement('style'); css.textContent = `
#gfx{position:fixed;inset:0;z-index:8;display:flex;flex-direction:column;align-items:center;background:rgba(6,11,29,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);pointer-events:auto;touch-action:pan-y;padding:calc(18px + var(--sat)) calc(16px + var(--sar)) calc(16px + var(--sab)) calc(16px + var(--sal))}
#gfx .hd{width:100%;max-width:860px;display:flex;align-items:center;gap:14px;margin-bottom:10px}
#gfx h2{font-size:clamp(26px,5vw,40px);text-align:left;flex:1}
#gfx .x{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:800 18px Inter;cursor:pointer}
#gfx .pre{width:100%;max-width:860px;display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
#gfx .pre button{flex:1 1 84px;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font:800 14px Inter;cursor:pointer;padding:6px 8px}
#gfx .pre button.on{border-color:var(--gold);background:rgba(255,207,135,.18);color:var(--gold)}
#gfx .auto{width:100%;max-width:860px;font:600 13px/1.45 Inter;opacity:.85;margin:2px 0 8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#gfx .list{width:100%;max-width:860px;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:0 22px;align-content:start;touch-action:pan-y;padding-right:4px}
#gfx .grp{grid-column:1/-1;font:800 11px Inter;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);margin:14px 0 4px}
#gfx .r{display:flex;align-items:center;gap:10px;min-height:44px;border-bottom:1px solid rgba(255,255,255,.08)}
#gfx .r label{flex:1;font:600 14px Inter;text-align:left}
#gfx select{min-height:36px;max-width:150px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:#141c3c;color:#fff;font:700 13px Inter;padding:4px 8px}
#gfx select.ch{border-color:var(--gold)}
#gfx .tog{border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.07);color:#fff;border-radius:999px;font:700 13px Inter;padding:9px 16px;cursor:pointer;min-height:40px}
#gfx .tog.on{border-color:var(--gold);color:var(--gold)}
#sfxO{position:fixed;right:calc(10px + var(--sar));bottom:calc(10px + var(--sab));z-index:7;margin:0;padding:9px 12px;border-radius:10px;background:rgba(4,8,22,.78);color:#cfe3ff;font:600 11px/1.5 ui-monospace,Menlo,monospace;pointer-events:none;white-space:pre-wrap;max-width:min(420px,92vw);text-align:left}
.gfxBtn{pointer-events:auto}`; document.head.appendChild(css);
    const el = document.createElement('section'); el.id = 'gfx'; el.className = 'hidden'; document.body.appendChild(el);
    el.innerHTML = `<div class="hd"><h2>Grafikk</h2><button class="x" aria-label="Lukk">✕</button></div><div class="pre"></div><div class="auto"><button class="tog" data-t="auto"></button><button class="tog" data-t="ov">Måleoverlegg</button><span></span></div><div class="list"></div>`;
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'click', 'wheel']) el.addEventListener(ev, e => e.stopPropagation(), { passive: true });
    const pre = el.querySelector('.pre'), list = el.querySelector('.list'), note = el.querySelector('.auto span'), bAuto = el.querySelector('[data-t=auto]'), bOv = el.querySelector('[data-t=ov]');
    NS.PRESET_ORDER.forEach(k => { const b = document.createElement('button'); b.textContent = NS.PRESETS[k].label; b.dataset.k = k; b.onclick = () => C.setPreset(k); pre.appendChild(b); });
    const sel = {}; let grp = ''; for (const [k, label, g, opts] of NS.SETTINGS) { if (g !== grp) { grp = g; const h = document.createElement('div'); h.className = 'grp'; h.textContent = g; list.appendChild(h); } const r = document.createElement('div'); r.className = 'r'; const id = 'gfx_' + k; r.innerHTML = `<label for="${id}">${label}</label>`; const s = document.createElement('select'); s.id = id; opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); }); s.onchange = () => { C.auto = false; C.set(k, Number(s.value)); }; r.appendChild(s); list.appendChild(r); sel[k] = s; }
    const UI = { open: false, overlay: false };
    UI.sync = () => {
      pre.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === C.preset)); bAuto.classList.toggle('on', C.auto); bAuto.textContent = C.auto ? 'Automatisk: på' : 'Automatisk: av'; bOv.classList.toggle('on', UI.overlay);
      for (const k in sel) { sel[k].value = String(C.s[k]); sel[k].classList.toggle('ch', C.s[k] !== NS.PRESETS[C.preset].s[k]); sel[k].disabled = C.legacy() && !['res', 'dpr', 'adaptive', 'fps', 'part', 'bloom', 'shadow', 'shake'].includes(k); }
      note.textContent = C.legacy() ? 'Viser den opprinnelige grafikken. SnowFX-innstillingene er slått av.' : C.auto ? 'Profilen velges og justeres etter målt bildetid.' : 'Profilen er låst. Bare oppløsningen kan justeres automatisk.';
    };
    bAuto.onclick = () => C.setAuto(!C.auto); bOv.onclick = () => UI.setOverlay(!UI.overlay);
    const close = () => { UI.open = false; el.classList.add('hidden'); onOpen && onOpen(false); }; el.querySelector('.x').onclick = close; UI.close = close;
    UI.show = () => { UI.open = true; UI.sync(); el.classList.remove('hidden'); onOpen && onOpen(true); };
    addEventListener('keydown', e => { if (e.code === 'KeyG' && !e.repeat && !/SELECT|INPUT/.test(document.activeElement?.tagName || '')) { UI.open ? close() : UI.show(); e.stopImmediatePropagation(); } else if (UI.open) { if (e.code === 'Escape') close(); e.stopImmediatePropagation(); } else if (e.code === 'KeyO' && !e.repeat) UI.setOverlay(!UI.overlay); }, true);
    const btn = (host, before) => { if (!host) return; const b = document.createElement('button'); b.className = 'ghost gfxBtn'; b.type = 'button'; b.textContent = 'Grafikk'; b.onclick = UI.show; before ? host.insertBefore(b, before) : host.appendChild(b); };
    const t = document.getElementById('title'); btn(t, document.getElementById('hint')); const p = document.getElementById('pause'); btn(p, document.getElementById('quitBtn'));
    const ov = document.createElement('pre'); ov.id = 'sfxO'; ov.className = 'hidden'; document.body.appendChild(ov);
    UI.setOverlay = on => { UI.overlay = on; ov.classList.toggle('hidden', !on); UI.sync(); try { localStorage.setItem('sj_gfxo', on ? '1' : '0'); } catch (e) {} };
    let acc = 0; UI.tick = dt => { if (!UI.overlay) return; acc += dt; if (acc < .4) return; acc = 0; const s = getStats(); ov.textContent =
      `FPS ${s.fps.toFixed(0)}   bildetid ${s.ms.toFixed(1)} ms   CPU ${s.cpu.toFixed(1)} ms   GPU ${s.gpu === null ? 'ikke støttet' : s.gpu > s.ms * 1.15 ? 'ikke pålitelig her' : s.gpu.toFixed(1) + ' ms'}\ntegnekall ${s.draws} (${s.all} med filter)   triangler ${(s.tris / 1000).toFixed(0)}k\nteksturer ${s.tex}   geometrier ${s.geo}   programmer ${s.prog}   partikler ${s.part}\nrendermål ${(s.mem / 1048576).toFixed(0)} MB   oppløsning ${s.w}×${s.h} (skala ${(s.scale * 100).toFixed(0)} %)\nprofil ${s.profile}${s.auto ? ' (auto)' : ''}   stemning ${s.mood}\n${s.fx}`; };
    C.listeners.push(() => UI.sync()); UI.sync(); try { if (localStorage.getItem('sj_gfxo') === '1') UI.setOverlay(true); } catch (e) {}
    return UI;
  };
})();
