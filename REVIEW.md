# Shadow Fiend Arena: stage 1 review

Date: 3 Nov 2026. No game files were changed for this review.

## How I tested

- Read all of `game.js`, `audio.js`, `index.html` and `style.css`.
- Checked `play.html` against the source files. It is up to date: it is exactly the 7 scripts and the CSS inlined into `index.html`. **There is no bundle script in the project**, so I will need to write one.
- Inspected every game-ready GLB (triangle counts and textures).
- Played all 3 maps in Chrome 152 through a local server, with sound muted. The browser tab was closed afterwards.
- Most runs used 7 bots on Hard, at 1920×1080, with fog on and off.
- Measured with `renderer.info`, WebGL GPU timer queries, `performance.memory` and long-task observers.
- **Test machine:** a fast Apple Silicon Mac running at 120 Hz. Absolute numbers will be much worse on a typical laptop's integrated GPU. The ratios are what matter.

## 1. Bugs and broken things

| # | Problem | Evidence |
|---|---|---|
| B1 | **GPU memory leak on every match start.** `clearMap()` frees geometry but never textures. Each match leaks the two 2048² ground canvas textures, roughly 45 MB of GPU memory. | Texture count went 27 → 29 → 31 … → 45 over 10 restarts. After 10 matches that is about 450 MB of GPU memory, which leads to stutter and eventually a lost context on weaker GPUs. |
| B2 | **Particle spawning depends on frame rate.** Hero trails, ambient embers, snow and rune sparkles spawn a fixed amount per rendered frame, not per second. | A 144 Hz monitor gets 2.4× the particles of a 60 Hz one; 240 Hz gets 4×. That costs more and looks different on different screens. |
| B3 | **Resume ignores changed settings.** If you press Esc, change bots, difficulty, fog or kills, then press RESUME, the changes are silently dropped. Only a map change restarts the game. | Code: the `$('play').onclick` handler. |
| B4 | **First-raze hitch.** One shader is still compiled on first use, despite `prewarm()`. | A 74 ms frame in the first seconds of every session. |
| B5 | **Auto-resolution causes hitches.** Each step calls `renderer.setSize()`, which reallocates the framebuffer. It only ever lowers pixel density (down to 0.55×) and never touches shadows, which are the biggest cost (see P1). | Code: `adaptResolution`. |
| B6 | **Fog of war leaks information.** Raze columns, smoke and sparks from enemies hidden in the fog are still drawn, only dimmed, so you can see where an unseen enemy is. Fog darkness also uses 3 different values (0.27, 0.25, 0.2) in different shaders. | Code: `columnMat`, particle shader. |
| B7 | The sound slider always un-mutes. A bot is named "Nevermore" while you are "You". The HUD uses fixed pixel sizes, so it is tiny at 1440p/4K. The help line sits under the action bar. | Seen in play and screenshots. |

I checked these and they are fine:
- The game pauses (back to the menu) and the audio suspends when the tab is hidden.
- The match end stops the bots, and Esc on the end screen is ignored correctly.
- The credit for the announcer voice is shown in the menu.

## 2. Performance (measured)

**CPU is not the problem.**
- Game logic takes 0.3–0.8 ms per frame on average, 1.2 ms at p95.
- Fog-of-war update: 0.3 ms at 15 Hz.
- Render submission: under 1 ms.
- 13–51 draw calls per frame.
- JS heap: 38–53 MB.

**The game is GPU fill-rate bound.** GPU time grows with pixel count.

| GPU ms per frame, 1920×1080, fog off, 7 bots | 1× | 1.5× (the "High" default on a retina laptop) | 2× |
|---|---|---|---|
| Ancient River | 5.6 | 8.5 | 12.8 |
| Scourge Pit | 2.8 | 5.4 | 9.6 |

These are Apple Silicon times. An integrated Intel or AMD laptop GPU is usually 4–8× slower, which means 35–70 ms (15–30 fps) on River. That matches the frame drops you've seen.

**Where the GPU time goes** (at 1.5×; each row shows what happened when I hid that one thing):

| Removed | Scourge Pit | Ancient River |
|---|---|---|
| nothing (baseline) | 3.1 ms | 6.2 ms |
| shadows | 1.7 ms (**−47%**) | 3.9 ms (**−36%**) |
| instanced props (trees, rocks) | 2.7 ms | 2.6 ms (**−58%**) |
| heroes | 2.7 ms | 4.7 ms (−24%) |
| particles | ~no change | ~no change |

**Why it costs that much:**
- **Triangles:**
  - River draws up to **790k triangles per frame**. It has about 100 instanced copies of the 6,199-triangle dead tree, and instanced meshes have frustum culling turned off.
  - Each hero is 20,500 triangles, drawn twice (colour and shadow). Eight heroes make 330k triangles.
- **Shadows:** the 2048² PCF shadow map redraws every hero and obstacle every frame.
- **Load:**
  - About 0.35 s to ready, plus a 140 ms long task at boot and 117 ms on the first PLAY click.
  - `play.html` is **11.6 MB**. About a third of that is base64 overhead.
  - The hero carries two 2048² JPEGs. The announcer is 0.9 MB of uncompressed WAV, where Opus would be about 0.1 MB.

## 3. What feels unfinished compared with Shadow Fiend Wars / DotA 1

- **The walk (your top complaint): I've found the cause.**
  - DotA 1's Shadow Fiend wasn't a unique model. It was WC3's **Firelord** tinted black: a legless, floating figure that **hunches forward** with its head low, glides smoothly with a slow float bob, lets its long arms swing loosely like pendulums, and trails a flowing tail.
  - The current code does the opposite. It leans the body **backwards** ("chest out"), and every stride adds a 9° roll, a 13° twist, a sideways hip sway and a hard bounce. That is a biped strut applied to a model with no legs, so it reads as wobbling.
  - With no skeleton, the arm bending in the shader also stretches the mesh.
- **Raze feel:** there's a 0.34 s cast with no hit-stop, no screen flash and no camera kick. The death is a shrink-and-spin. There's no kill cam and no slow motion on the winning kill.
- **No Requiem of Souls.** The original raze maps always had razes **plus Requiem**.
- **Menus:** one settings panel acts as title, lobby and pause menu. There's no hero or colour pick, no loading art, and the end screen shows only K/D.
- **Audio:** no music. The sound effects are synthesised and decent, but the ambience is thin.
- **Maps:** they are good, but static. River's water shader reads as sky clouds. The low-poly grey rim rocks clash with the detailed crystals and gargoyles.

## 4. What's missing

- **Gameplay systems:**
  - Gold, shop and items.
  - Ultimate.
  - Team mode.
  - Assists and assist gold.
  - Match statistics: damage, accuracy, souls, gold.
- **Feedback and presentation:**
  - Hit-stop, damage flash and kill cam.
  - Title and pick screens.
  - Fourth map.
  - Ambient creatures and weather.
- **Assets:**
  - Item icons.
  - Shop building.
  - Ward model.
  - Rigged hero with walk, idle, cast and death animations.
  - Music.
  - Loading or title art.
- **Tooling:**
  - A bundle script.
  - Version control. The folder isn't a git repository yet, so there's no undo for the changes ahead.

## 5. Research notes

- **DotA 1 Shadowraze:** 200/450/700 range, 250 radius, 10 s cooldown.
- **Necromastery:** +2 damage per soul, maximum 36 souls, half lost on death.
- **Requiem of Souls:** 1 line per 2 souls, 80/120/160 damage per line, 25% slow.
- **DotA 1 move speed:** 305 for Shadow Fiend.
- The raze maps on Hive and Epicwar (*SF Wars*, *Shadowraze Wars*, *Nevermore Wars*, *Raze*) ran FFA or up to 4v4. Their stated gimmick was Shadowraze + Requiem only.
- I couldn't load Hive's pages (403), so the details of their shops and runes are unverified.
- Item reference costs:

  | Item | Cost |
  |---|---|
  | Blink | 2150 |
  | Boots | 500 |
  | Power Treads | 1450 |
  | Eul's | 2800 |
  | BKB | 3900 |
  | Shadow Blade | 3400 |
  | Observer Wards | 200 for 2 |
  | Salve | 100 |
  | Magic Wand | about 500 |
  | Aghanim's | 4200 |

  I'll scale these to a short raze match in stage 3.
- **Licensed sources for new assets:**
  - Kenney audio (CC0).
  - Quaternius rigs and animations (CC0).
  - game-icons.net (CC-BY 3.0, needs credit).
  - Kevin MacLeod music (CC-BY 4.0).
- **Three.js:** latest is r187. Upgrading from r147 is a big job: the colour-management and lighting changes break every hand-written shader and tuned light. I recommend staying on r147 for now and doing the upgrade as a separate step later.

## 6. Prioritised plan

**P0: Stage 2, optimise (prove each step with before and after numbers)**
1. Set up git, and add a `build.py` that inlines everything into `play.html` exactly as today.
2. Fix the texture leak (B1) and make particle spawning frame-rate independent (B2).
3. Shadows:
   - Only heroes and obstacles cast shadows.
   - Use a 1024² map that follows the camera.
   - Update the static parts only once.
   - Make shadows a tier the auto-resolution can switch off before it drops pixel density.
4. Geometry:
   - A 6–8k-triangle hero LOD.
   - Low-poly instanced trees for the River backdrop.
   - Turn culling back on.
5. Auto-resolution:
   - Smoother steps without framebuffer reallocation hitches.
   - Tiers: shadows, then particles, then pixel ratio.
   - Fix the prewarm gap (B4).
6. File size:
   - Textures to 1024² WebP.
   - Announcer to Opus.
   - Optionally meshopt-compressed geometry, with the decoder inlined.
   - Target: under 7 MB.

**P1: The walk (you flagged it, so it comes right after P0)**
- **Quick win, free:** retune the procedural animation to the Firelord style.
  - Forward hunch of about 15–20°, head low.
  - Smooth glide with a slow float bob.
  - Loose alternating arm pendulum.
  - Tail streaming behind.
  - No hip roll or twist.
- **Proper fix:** a real skeleton (spine, 2 arms, tail chain) with idle, glide, raze-slam, Requiem and death clips. Either rig the existing mesh in Blender, which is free, or use Meshy's rigging. Meshy costs credits, so I'll ask first.

**P2: Stage 3, shop and items**
- Gold from kills, assists and a passive trickle.
- B key plus a shop building on each map.
- A 6-slot inventory with hotkeys.
- The 9 items you listed, under original names, with game-icons.net art.
- Bots buy and use items at every difficulty.

**P3: Stage 4, appeal (biggest feel gains first)**
1. Hit feedback: hit-stop, flash, camera kick and a proper death dissolve.
2. Requiem of Souls on R.
3. Slow motion on the final kill, and an end screen with stats.
4. Title screen and hero/colour pick.
5. Music.
6. Team mode (2v2 / 3v3).
7. Fourth map, and ambient life and weather on the existing maps.

**P4: Stage 5, assets**
- A costed list: rigged hero, shop building, ward, item icons, new props, title and loading art, music.
- I'll ask before any paid generation.
