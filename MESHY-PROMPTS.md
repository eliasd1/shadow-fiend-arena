# Meshy prompts for Shadow Fiend Arena

Each prompt below is ready to paste into Meshy's text-to-3D box.

## Settings to use for every prop

- **Style:** stylised or hand-painted, if Meshy offers that option. The look to aim for is chunky shapes, bold readable silhouettes and painted colour, like 2004-era RTS games. Avoid photoreal.
- **Topology:** triangle, with a **target polycount of about 5,000** for props (8,000–10,000 for the shop and the throne).
- **Textures:** base colour only, or turn off the PBR maps if you can. Use 1024 px textures; bigger ones bloat the single file.
- **Export:** GLB.
- **Where to save:** `models/raw/` in the project, named as listed (for example `shop.glb`). I'll take it from there: shrink it, compress it, check the triangle count and add it to the map and the credits.
- **Prompt rules:** one object per prompt, no ground or base plate unless asked, and centred.
- **Brand names:** never put "Warcraft", "DotA" or "Blizzard" in a prompt. Describe the look instead, so the designs stay original and safe to publish.
- **Licence:** on Meshy's free plan, models are CC BY 4.0, so I'll credit Meshy in the game. A paid plan lets you own them outright. Every generation spends credits, so check your balance first. Generate the preview, and only refine the ones you like.

---

## Batch 1 — needed for the shop and items (do these first)

1. **`shop.glb` — the Soul Merchant shrine**
   > A small dark-fantasy merchant shrine: a hunched stone hut with a crooked slate roof, glowing green-orange lanterns hanging from bone hooks, a wooden counter with potion bottles and a small chest of gold coins, tattered purple cloth awning, stylized hand-painted game asset, chunky exaggerated proportions, readable from a top-down camera

2. **`ward.glb` — Observer Ward**
   > A floating magical sentry eye on a tall twisted wooden staff, glowing yellow eye with a slit pupil wrapped in iron bands, small feathers and charms tied below it, stylized hand-painted fantasy game prop, simple bold silhouette

3. **`rune-altar.glb` — the stone the runes spawn on**
   > A low circular stone rune altar, ancient carved glyphs around the rim, four small broken pillars at the edges, cracked flagstones, stylized hand-painted fantasy game asset, flat top for an object to hover above

---

## Batch 2 — Scourge Pit (lava map)

4. **`ziggurat.glb`**
   > A dark undead ziggurat tower with a stepped stone base, a floating purple soul crystal on top, spikes and rib-like bone arches, glowing green runes, stylized hand-painted dark fantasy RTS building

5. **`skull-brazier.glb`**
   > A tall iron brazier shaped like a skull with burning coals inside its open jaw, chains hanging off it, stylized hand-painted dark fantasy game prop

6. **`bone-pile.glb`**
   > A pile of giant skulls, ribs and broken bones half-sunk in ash, stylized hand-painted dark fantasy game prop, low and wide

7. **`spike-fence.glb`**
   > A section of black iron spiked fence with impaled skulls, rusted and bent, stylized hand-painted dark fantasy game prop, straight segment that can repeat

8. **`chain-bridge.glb`**
   > A short dark stone bridge with cracked slabs, iron chains as railings, small skull ornaments on the posts, stylized hand-painted dark fantasy game asset, about twice as long as wide

---

## Batch 3 — Ancient River (night forest map)

9. **`moon-basin.glb`**
   > An ancient elven stone basin filled with glowing blue water, carved leaf patterns, moss and vines, stylized hand-painted fantasy game prop

10. **`ruin-arch.glb`**
    > A crumbling mossy stone archway from an ancient forest temple, ivy hanging down, one side broken, stylized hand-painted fantasy game asset

11. **`twisted-tree.glb`**
    > A large twisted night-forest tree with a thick gnarled trunk and a dense dark blue-green canopy, roots spreading out, stylized hand-painted fantasy game asset with chunky leaf clumps, low poly friendly

12. **`mushroom-cluster.glb`**
    > A cluster of glowing teal mushrooms of different sizes on a mossy log, stylized hand-painted fantasy game prop

13. **`stone-lantern.glb`**
    > A carved stone lantern post with a soft glowing blue flame, moss at the base, stylized hand-painted fantasy game prop

---

## Batch 4 — Frozen Throne (ice map)

14. **`ice-throne.glb`** (centrepiece behind the arena)
    > A massive throne carved from jagged blue ice on top of a spiked ice spire, frozen chains, a cold glow from inside the ice, stylized hand-painted dark fantasy game asset, imposing silhouette

15. **`frozen-pillar.glb`**
    > A broken ancient stone pillar encased in ice and snow, icicles hanging off it, stylized hand-painted fantasy game prop

16. **`snow-pine.glb`**
    > A snow-covered dark pine tree, stylized hand-painted fantasy game asset, chunky layered branches

17. **`frozen-warrior.glb`**
    > A skeleton warrior frozen inside a block of ice, kneeling with a broken sword, stylized hand-painted dark fantasy game prop

---

## Batch 5 — fourth map, "Graveyard of Nevermore"

18. **`crypt.glb`**
    > A gothic stone crypt with a heavy iron door, gargoyles on the roof, cracked steps, purple light leaking from inside, stylized hand-painted dark fantasy game asset

19. **`tombstones.glb`**
    > A cluster of five crooked old tombstones of different shapes with moss and cracks, stylized hand-painted game prop, low and wide

20. **`dead-oak.glb`**
    > A huge leafless dead oak tree with twisted claw-like branches and a hanging rope, stylized hand-painted dark fantasy game asset

21. **`graveyard-gate.glb`**
    > A rusted wrought-iron graveyard gate between two stone posts topped with skull lanterns, stylized hand-painted dark fantasy game asset

---

## Optional — a new hero model

The current hero works. Only generate a new one if you want a fresher look; I'll rig it myself in code.

22. **`hero-v2.glb`**
    > A floating shadow demon with no legs: a hunched muscular dark torso that tapers into a wispy smoky tail, very long arms ending in large claws, small horned head held low and forward, glowing red eyes and a glowing red core in the chest, burning ember cracks across the skin, standing with arms relaxed slightly away from the body, stylized hand-painted dark fantasy game character

    - **Settings:** about 10,000 triangles, 1024 px texture.
    - **Don't use Meshy's auto-rigging or animation on this one.** That tool expects a character with two legs, and this demon has none. I'll build a skeleton for it in code instead (spine, arms, head and a tail chain).

---

## What I don't need from Meshy

These come from free, credited sources or are made in code:
- item icons (game-icons.net, CC BY 3.0)
- music and sound effects (Kenney CC0 / CC BY music)
- weather, fireflies, embers, bats and crows (built in code)

---

## Animation: what Meshy can and can't do for the hero

Meshy's **Rig** and **Animate** tools are built for **humanoids with two arms and two legs**, standing in a T-pose or A-pose. Our Shadow Fiend has no legs; his body tapers into a tail. Meshy's auto-rig will either refuse it or put leg bones in the tail. That is why the hero is now rigged and animated in code, with a 16-bone skeleton and spring physics on every joint.

### Option A: keep the current legless hero (recommended, free)
You don't need Meshy for this. Tell me what feels off in a match, for example "arms too floppy" or "lean more when he stops", and I'll tune it. Every setting lives in one place: `SPRING` and `animate()` in `game/game.js`.

### Option B: a new hero with legs, so Meshy can rig and animate it
This gives keyframed animation (walk, run, idle, attack) from Meshy's library. The catch: it's a different silhouette from the DotA 1 gliding Shadow Fiend.

1. **Text to 3D:** pick **A-pose** in the pose setting, about **15,000 triangles**, 2048 px texture.
   > A tall gaunt shadow demon standing in A-pose, digitigrade demon legs, very long arms with large curved claws, small horned head held low, spiked shoulder plates, dark charcoal skin with glowing red ember cracks, glowing red core in the chest, wisps of black smoke trailing from the shoulders, stylized hand-painted dark fantasy game character, symmetrical, full body visible
2. **Rig:** use **Humanoid** auto-rig.
3. **Animate:** pick from the library: **Walk** (a slow, heavy, menacing walk), **Idle** (breathing, menacing), **Spell / cast with both arms** (for the raze), **Death**, and if offered **Run** and **Hit reaction**.
4. **Export:** GLB *with animations*. Save it as `models/raw/hero-rigged.glb` and tell me. I'll switch the game to play its clips through Three.js's animation mixer, with smooth blending between them.

Every generation, rig and animation costs Meshy credits, so check your balance first.
