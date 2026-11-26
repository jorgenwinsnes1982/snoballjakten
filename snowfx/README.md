# SnowFX Extreme

The graphics engine for Snøballjakten. These are plain scripts that load next to `index.html`, the same way as the files in `models/`. No build step is needed, and they run on GitHub Pages, as an artifact and from local files.

If the files are missing or SnowFX fails to start, the game runs on the old v32 renderer.

## Files

| File | Contents |
|---|---|
| `config.js` | Eight graphics profiles, 29 settings saved in `localStorage` (`sj_gfx`) and the adaptive quality governor |
| `pipeline.js` | HDR render chain: GTAO with contact shadows, volumetric light and fog, bloom, motion blur, DoF, ACES, a 3D LUT, vignette, grain, dither, FXAA or SMAA |
| `sky.js` | Sky shader with moon, stars, clouds and aurora, a mood/weather script for each run, PMREM environment map and fog |
| `snow.js` | Snow material, ice material, screen-space reflections on ice and the deformation map for tracks |
| `particles.js` | GPU particles (5,200, stateless, instanced) and snow blowing along the ground |
| `world.js` | Materials for buildings, clothing, trees and the bridge; instanced dressing (rocks, grass, ice, icicles, distant trees); ridges, mountains and the scarf |
| `ui.js` | Graphics menu (G key or the Grafikk button) and the measurement overlay (O key) |
| `main.js` | Glue code: material patching, effects driven by game state, fallbacks |

## Rules the engine follows

- **Read-only towards the game.** SnowFX never changes physics, collisions, spawns, the seeded course generator or scoring. Tracks, drifts and spray are visual only, and everything stands on the game's own `gY()`. The game's simulator gives identical results before and after (see testing).
- **One switch.** The Original and Potato profiles use the v32 renderer unchanged: the same materials, composer and fog. Each material has two versions, and the shader cache key follows the mode, so a profile change recompiles exactly what changed.
- **Fallback ladder.** A shader error, a render target the driver refuses, or a black picture (pixel readback every 0.8 s) steps down in this order:
  1. Rebuild the render targets.
  2. Switch to 8-bit targets.
  3. Use the old renderer.
- **iOS.** HDR targets on iOS are never multisampled. MSAA is only used on desktop.

## Profiles

Original, Potet, Lav, Middels, Høy, Ultra, Extreme, Cinematic.

The first choice comes from the GPU name. The governor then works from measured frame times:

1. When the slowest quarter of frames is more than 18 % over budget for 1.6 s, resolution drops 10–15 % at a time, down to 60 %.
2. If that is not enough, the profile drops one step. This waits for a menu or pause, because a profile change recompiles shaders.
3. It only climbs back after 8 s of good frames.
4. A climb that fails within 10 s locks climbing for 60 s.

The governor treats GPU time as headroom only when the driver reports it plausibly.

## Not built, and why

- **WebGPU.** All materials are GLSL patches made with `onBeforeCompile`, and the post-processing is a WebGL chain. Three.js `WebGPURenderer` needs node materials, so supporting it would mean rewriting every material. That is the full migration the brief said not to do. WebGL2 is kept.
- **TAA.** Without motion vectors per object, the fast camera produces ghosting. MSAA and SMAA are used instead.
- **KTX2/Basis.** The project has no texture pipeline: the models are base64 GLB with JPEG textures, and no encoder is installed. The procedural textures are generated at startup and mip-mapped.
