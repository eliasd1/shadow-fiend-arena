# Map art direction

These maps aim to look like a hand-painted Warcraft 3 diorama, not photoreal. The photo-textured ground experiment was too busy and was dropped.

The look follows five rules:

1. **The fighting floor stays calm.** The ground is broad, soft colour (four octaves of blurred noise) with low-contrast grain. Heroes, raze circles and runes must be the most readable things on screen.
2. **Edges are feathered.** Paths, river banks and lava banks are painted on a low-resolution layer and stretched, so no edge is hard.
3. **Detail goes where Warcraft 3 put doodads.** Boulders gather in clumps and gaps along cliff feet, ramp flanks and the map rim. Grass tufts cluster at the edges and at cliff feet. Pebbles have soft contact shadows.
4. **Warm firelight sits against a cool night.** Braziers flank ramps and merchants. Their light pools are baked into the ground's glow map, so they add no runtime lights. The flames flicker and face the camera.
5. **The focus stays on the middle.** The ground is painted slightly lighter in the middle and darker toward the rim, and a CSS vignette darkens the screen corners.

Each map's palette is in `LOOK` in `game/game.js`. It sets the base, low and high ground colours, accent patches, paths, rock and cap colour (moss, ash or snow), the grass, and the fire colour.

**Cost:** about 0.1–0.2 ms of extra render CPU per frame. Steady frames stay at 60 fps (p99 17.5–19 ms). Map build takes 30–85 ms.
