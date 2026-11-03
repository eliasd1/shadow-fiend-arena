# Stage 2: optimisation report

Date: 3 Nov 2026.

## How it was measured

- **Benchmark:** `game/dev/bench.js`, which is not part of `play.html`.
- **Setup:** Chrome 152 at 1920×1080, pixel ratio forced to 1.5 (the "High" default on a retina laptop), 7 Hard bots, seeded randomness, 8 s per run. Sound muted.
- **GPU time:** WebGL timer queries.
- **Frame time:** pinned at 8.33 ms (120 Hz vsync) on this Mac in every run, so GPU time is the number that shows the gain.
- **Expected effect on slower machines:** about 4–8× slower than this one, for example a laptop with integrated graphics. GPU time roughly decides frame rate there, so a 40–60% cut makes the same difference.

## Before and after

| Scenario | GPU ms avg (before → after) | GPU ms p95 (before → after) | Change |
|---|---|---|---|
| Scourge Pit, fog off | 5.68 → 3.51 | 7.08 → 4.37 | **−38%** |
| Ancient River, fog off | 8.62 → 3.30 | 10.72 → 4.11 | **−62%** |
| Frozen Throne, fog off | 5.99 → 3.76 | 7.68 → 4.84 | **−37%** |
| Ancient River, fog on | 8.33 → 3.65 | 9.96 → 4.65 | **−56%** |

| Other measures | Before | After |
|---|---|---|
| River triangles per frame (p95) | 770k | 323k |
| Textures leaked per match start | +2 (~45 MB of GPU memory) | **0** (19 → 19 → 19…) |
| Geometries per match start | grew without limit | stable per map |
| JS heap during play | 52–55 MB | 28–54 MB |
| Shadow-map pass + PCF sampling | every frame | **gone** |
| Long tasks during play | first-raze hitch (74 ms) | none (only the 123 ms start, behind the menu) |
| Map start | 60–125 ms | 87–149 ms (now includes shadow baking) |
| `play.html` size | **11.60 MB** | **6.04 MB** |

Draw calls went up, from 21–47 to 58–87. That comes from the hero shadows and the per-cell prop meshes, and stays well inside desktop budgets of a few hundred. Triangles on Scourge Pit also rose slightly (141k → 202k) because of the hero shadows, but GPU time still fell 38%.

## What changed

1. **No shadow map.**
   - Prop shadows are now baked into the ground texture when a map loads. Every prop triangle is projected along the sun and blurred, which gives the same direction and shape at zero runtime cost.
   - Heroes cast real-time planar shadows: their mesh flattened onto the ground, with a stencil so overlapping shadows don't double-darken. That is how WC3-era games did it.
2. **Low-poly versions from a new simplifier.** `tools/assets.mjs` contains a quadric edge-collapse simplifier with no dependencies. It produced:
   - a 759-triangle backdrop tree (was 6,199) for River's surrounding forest;
   - a 2,500-triangle hero shadow proxy (was 20,500).
3. **Frustum culling for props.** Instanced props are split into 14×14 cells with real bounds, so groups off screen are skipped.
4. **Quality ladder for auto-resolution.** Slow frames now step down in this order: hero shadows off, then fewer effect particles, then lower pixel density, all the way to 0.55×. Pixel-density changes, which resize the canvas, are at least 2.5 s apart. Smooth frames climb back up slowly. I tested this under simulated load: it stepped down one rung per second, then recovered when the load stopped.
5. **Leak fixed.** Every map rebuild now frees its own textures, materials and geometry. Units free their cloned materials.
6. **Frame-rate-independent effects.** All continuous particle emitters use per-second rates, so 144 Hz and 240 Hz screens no longer spawn 2–4× the particles.
7. **Smaller assets.**
   - Textures: 1024 px for the hero and big decor, 512 px for small props, a small metal/roughness map.
   - Geometry: quantised (int16 positions, int8 normals, uint16 UVs, via KHR_mesh_quantization).
   - Announcer: AAC instead of WAV, 1.19 MB → 0.23 MB. All 12 clips were checked to decode, with the same lengths.
8. **Resume bug fixed (B3).** Changing a match setting while paused now turns the button into NEW GAME. Movement and graphics changes apply on Resume.

## How to rebuild

```
node tools/assets.mjs   # only after changing models/ or audio/announcer/ (needs macOS: sips, afconvert)
python3 build.py        # after any change in game/
```

- `models/optimized/` holds the processed GLBs for inspection. It is git-ignored.
- `audio/announcer/` keeps the original WAVs, so the encode can be redone at any quality.

## Checked

- All 3 maps load and play with no errors, with fog on and off.
- `play.html` opens straight from disk (file://) in Chrome. I checked this in a headless, muted run with a throwaway profile.
- The game still pauses when the tab is hidden. That code is unchanged.
- The CC-BY credit for the announcer is still in the menu and in `announcer-data.js`.

## Not done yet

- Not tested in Safari or Firefox.
- Not tested on a real low-end GPU. The 4–8× estimate above is a projection, not a measurement.
- The fog-of-war information leak (B6) is not fixed. It belongs with fog tuning.
- The hero's main mesh is still 20,500 triangles. That is fine for now; the rigged hero will replace it.
