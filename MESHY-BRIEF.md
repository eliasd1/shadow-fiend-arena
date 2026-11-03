# Art brief for Meshy: Shadow Fiend Arena

**For Meshy's AI.** This brief has everything needed to make the game's art. Work through the asset list in order, save each file exactly where it says, and don't edit any code. The game's build tools pick up new files automatically.

---

## 1. The game

**Shadow Fiend Arena** is a browser remake of the old Warcraft III custom map *Shadow Fiend Wars*, the DotA 1 "raze duel".
- Every player is the same demon, a soul-harvesting shadow fiend.
- Players glide around small arenas and blast the ground in front of them with three "razes" (near, mid and far columns of shadow-fire).
- Hits steal souls. First to N kills wins.
- There is a shop with items, runes, fog of war, and three maps today:
  - **Scourge Pit:** a lava pit with stone bridges.
  - **Ancient River:** a night forest with a river.
  - **Frozen Throne:** an ice platform over an abyss.

**Camera:** high, about 55° looking down, like an RTS or MOBA. Objects are seen mostly from above at 100–300 pixels tall. **Silhouette and top-down readability matter more than small details.**

The game already contains these Meshy models, and new work must match them:
- `models/shadow-fiend-game.glb`: the hero, a legless horned demon with long clawed arms, dark charcoal skin and glowing red cracks.
- `models/props/game-ready/*.glb`: obelisk, gargoyle, column, dead tree and ice crystal. Dark, weathered and realistic.

## 2. Art direction: "old school, made modern"

**The feel:** Warcraft III and DotA 1 (around 2005), re-imagined with today's quality, like a remaster:
- **Shapes:** the chunky, bold, slightly exaggerated shapes of a 2000s RTS.
- **Materials:** modern hand-painted PBR on top: weathered stone, rusted iron, cracked bone, worn leather, tarnished gold.
- **Mood:** dark fantasy and undead, grim and heavy. Strong contrast between dark materials and a few **glowing accents** (ember orange, soul green, cold blue, blood red).
- **Proportions:** realistic. Grime, wear and age on everything.

**Not wanted:**
- cartoon, chibi or toy-like looks
- pastel or candy colours
- clean, new-looking surfaces
- plastic or glossy materials
- cute or rounded "mobile game" style
- photo-scans

The last attempt (a code-built shop) failed because it looked like a toy.

**Copyright:** never write "Warcraft", "DotA", "Blizzard", "Valve", "Shadow Fiend" or "Nevermore" in prompts, and don't copy any existing in-game design. Describe the look instead, so everything is original.

## 3. Technical rules (every 3D model)

- **Format:** GLB.
- **Single object:** one mesh, one material. Bake all colour into the texture.
- **Orientation:** Y-up, front facing **+Z**, centred on the origin, base sitting at y = 0.
- **Transforms:** none. Apply or freeze transforms before export.
- **No extras:** no ground plane, platform or base slab unless asked; no lights; no cameras.
- **Triangles:** about **5,000** for props, at most **8,000** for buildings. Use triangle topology.
- **Textures:**
  - 2048 px base colour.
  - Metallic/roughness optional (2048 or smaller).
  - No normal map needed.
- **Licence:** if the account is on Meshy's free plan, tell the user. Free-plan outputs are CC BY 4.0, and the game will credit Meshy.

For 2D images (icons, title art): PNG or JPG, at the sizes listed.

## 4. Asset list (in priority order)

### A. The shop building: "Soul Merchant" (most important)
**Save as `models/raw/shop.glb`**, about 6,000–8,000 triangles. This replaces the current placeholder.
> A grim dark-fantasy merchant's outpost built into the ruins of an undead shrine: a squat round tower of black weathered stone with iron bands, a steep crooked roof of dark slate and bone spikes, a tattered crimson awning over a heavy wooden trading counter piled with rusted chests, scrolls, bottles and a spilled heap of gold coins, two iron cage lanterns glowing sickly green, chains and skulls hanging from the eaves, a faint green soul-fire flickering in a brazier on the roof, realistic proportions, weathered hand-painted PBR textures, gritty and aged, readable silhouette from a high top-down camera

### B. Item icons (10 images, square)
**Save as `art/icons/<id>.png`**, 512×512 px, one per item. These replace the current icons.

Style for all ten: a **painted classic-RTS inventory icon**.
- **Object:** one object filling about 80% of the frame, slightly angled, dramatic rim lighting.
- **Background:** a dark smoky background with a subtle colour glow behind the object.
- **Quality:** realistic oil-paint detail, gritty, no text, no border (the game adds its own frame).

| id | subject (prompt text) |
|---|---|
| `boots` | worn leather traveller's boots with iron toe caps and buckles, dust trailing, warm brown glow |
| `treads` | heavy dark iron-plated boots with glowing ember-orange runes and smouldering soles, fiery glow |
| `salve` | a small round glass vial of glowing green healing salve with a cork, sitting on herbs, soft green glow |
| `wand` | a short twisted black wooden wand tipped with a violet crystal crackling with captured souls, purple glow |
| `ward` | a carved wooden totem staff topped with a single glowing yellow slit-pupil eye, golden glow |
| `dagger` | an ornate curved silver dagger with a blue gem pommel, the blade leaving a streak of blue shadow, cold blue glow |
| `cyclone` | a gnarled druid staff with a pale crystal head inside a swirling white whirlwind, cyan glow |
| `blade` | a slim dark sword half dissolving into violet mist, translucent edge, purple glow |
| `avatar` | a heavy black iron totem bar bound in gold with a glowing golden rune, radiant gold glow |
| `scepter` | an ornate dark-gold sceptre topped with a blood-red faceted gem and small horns, deep red glow |

### C. Watcher Ward (3D)
**Save as `models/raw/ward.glb`**, about 1,500 triangles, about 1.5 m tall.
> A small carved wooden totem staff planted in the ground, topped by a single large glowing yellow eye with a slit pupil wrapped in iron bands, feathers and bone charms tied below it, weathered hand-painted PBR, dark fantasy

### D. Rune stones (3D, 3 models)
Runes float above the arena and grant Haste (red), Double Damage (blue) and Regeneration (green). About 2,000 triangles each.
**Save as `models/raw/rune-haste.glb`, `models/raw/rune-dd.glb` and `models/raw/rune-regen.glb`.**
> A floating carved stone rune tablet, ancient and cracked, deeply engraved with a single glowing [crimson / sapphire blue / emerald green] sigil, small chips of stone orbiting it, weathered hand-painted PBR, dark fantasy

### E. Map props to bring the maps to life
**Save as `models/raw/<name>.glb`**, about 5,000 triangles each. Same art direction, all weathered and dark.

**Scourge Pit (lava):**
- `ziggurat`: undead stepped stone tower with a floating purple soul crystal on top, rib-like bone arches, glowing runes
- `skull-brazier`: tall iron brazier shaped like a horned skull with burning coals in its jaw, chains
- `bone-pile`: giant skulls and ribs half sunk in ash

**Ancient River (night forest):**
- `moon-basin`: ancient carved stone basin of glowing blue water, moss and vines
- `ruin-arch`: crumbling mossy temple archway, ivy, one side broken
- `stone-lantern`: carved stone lantern post with a soft blue flame

**Frozen Throne (ice):**
- `ice-throne`: a massive jagged ice throne on a spiked ice spire, frozen chains, cold inner glow. Up to 8,000 triangles.
- `frozen-pillar`: broken stone pillar encased in ice, icicles

**Fourth map, Graveyard:**
- `crypt`: gothic stone crypt, iron door, gargoyles on the roof, purple light leaking out
- `tombstones`: a cluster of five crooked old tombstones
- `dead-oak`: huge leafless dead oak with claw-like branches

### F. Title and loading art (2D)
**Save as `art/title.jpg`**, 1920×1080, with dark negative space on the left third for the menu.
> Epic dark-fantasy key art: a hunched horned shadow demon with no legs, its body trailing into black smoke, very long clawed arms raised as columns of red-black shadow fire erupt from cracked ground around it, souls of fallen warriors spiralling into its glowing chest, a ruined arena with lava cracks under a stormy blood-red sky, painterly, dramatic rim light, gritty, cinematic, dark negative space on the left side

## 5. When you're done

List every file you saved, with its triangle count where it applies. If something failed or was skipped, say so. Don't change any `.js`, `.html` or `.py` files.

The developer then runs `node tools/assets.mjs` and `python3 build.py` to put the art into `game/play.html`.
