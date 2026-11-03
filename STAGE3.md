# Stage 3: gold, shop and items

## Gold

| Source | Amount |
|---|---|
| Starting gold | 200 |
| Passive trickle | 2 per second (120 per minute) |
| Kill bounty | 150 + 25 × the victim's kill streak |
| First blood | +100 on top of the bounty |
| Assist | 60 to every other hero who hit the victim in the last 10 s |
| Selling | half the item's price (right-click an inventory slot) |

In 6-minute bot matches, a hero earned **750–880 gold per minute**. A big item like the Shadowstep Dagger arrives around minute 2, and the Avatar Totem around minute 3.

## Items

Original names and icons, inspired by the DotA 1 items. Prices are scaled down for a short raze duel, where a match lasts about 5–8 minutes.

| Item (DotA 1 inspiration) | Cost | Type | Effect | Cooldown |
|---|---|---|---|---|
| **Swift Boots** (Boots of Speed) | 300 | passive | +15% movement speed | — |
| **Ember Treads** (Power Treads) | 650 with Swift Boots (950 without) | passive | +25% movement speed, +120 max health. Replaces the boots | — |
| **Soothing Salve** (Healing Salve) | 75, stacks to 3 | consumable | heals 350 over 8 s; taking hero damage ends it | — |
| **Soul Wand** (Magic Wand) | 250 | active | +1 charge each time a visible enemy razes within 12 (max 15); use to heal 30 per charge | 8 s |
| **Watcher Ward** (Observer Ward) | 75, stacks to 2 | consumable | plant at the cursor (range 6); 10 vision radius for 150 s; invisible to enemies; max 3 out | — |
| **Shadowstep Dagger** (Blink Dagger) | 900 | active | blink up to 12 toward the cursor; disabled for 3 s after taking hero damage | 12 s |
| **Cyclone Staff** (Eul's Scepter) | 1000 | active | lift the enemy nearest the cursor, or yourself, for 2.2 s: no moving, acting or damage, and their raze is cancelled. Range 7, +8% move speed | 20 s |
| **Veil Blade** (Shadow Blade) | 1100 | active | invisible 9 s, +20% speed; razing or using an item reveals you; the revealing raze deals +120 | 22 s |
| **Avatar Totem** (Black King Bar) | 1400 | active | raze immunity 6 s, then 5, 4 and 3 s on later uses; +60 max health; lava still burns | 45 s |
| **Abyssal Scepter** (Aghanim's Scepter) | 1700 | passive | +150 max health, −15% raze cooldown. **Shadow Mark:** each of your raze hits marks the target; every mark adds +40 to your next raze on them (max 4, lasts 6 s) | — |

Why these numbers:
- A raze does 170 + 9 per soul, and a hero has 700 health. A 2–3 s window of safety (cyclone, totem) or 12 units of reposition (dagger) is already decisive.
- Cooldowns are long compared with the 2.6 s raze cooldown, so items are big plays, not spam.
- The Scepter is an "Aghanim's-style raze upgrade": it rewards landing several razes in a row on the same hero.

## Controls

| Action | Input |
|---|---|
| Open or close the shop | **B**, the **SHOP** button, or right-click a Soul Merchant building (you walk there and it opens) |
| Buy | click an item in the shop |
| Use an item | **1–6**. Targeted items aim at the cursor: Dagger, Ward, and Cyclone (enemy near the cursor, otherwise yourself) |
| Sell | right-click an inventory slot |

Each map has two Soul Merchant shops, shown as gold squares on the minimap. The building is a code-built placeholder. If you generate `models/raw/shop.glb` with Meshy, `node tools/assets.mjs` swaps it in automatically.

The raze hotkeys 1, 2 and 3 were removed so the number keys can belong to items. Z, X and C still raze.

## Bots

| Difficulty | Buying order | Item use |
|---|---|---|
| Easy | boots, salve, wand, treads, cyclone | uses items about 35% of the times it makes sense |
| Normal | boots, salve, wand, treads, dagger, cyclone, scepter, totem | about 70% |
| Hard | boots, ward (with fog on), treads, dagger, totem, cyclone, veil, scepter, wand | always |

What bots do with them:
- **When a raze is about to hit:** Avatar Totem, then Cyclone on the caster (which cancels the raze), then Dagger away.
- **Low health:** salve when not under fire, wand at 4+ charges, Veil Blade plus running away when below about 30%.
- **Attacking:** they blink to mid-raze range when the target is 9.5–17 away, and on Hard they also slip in invisibly.
- **Wards:** on Hard with fog on, they ward the nearest rune spot.
- **Full bag:** they sell a consumable or small item to make room for the next big item.

Measured in 6-minute bot-only matches. The Hard match ran on Scourge Pit, Normal on Ancient River and Easy on Frozen Throne; use counts are totals across all 5 bots.

| | First Dagger | Totem | Cyclone | Veil | Blinks | Totems | Cyclones | Salves | Wards |
|---|---|---|---|---|---|---|---|---|---|
| Hard | 2:00 | 2:55 | 3:45 | 5:00 | 64 | 13 | 13 | 49 | 5 |
| Normal | 2:10 | — | 3:15 | — | 49 | 0 | 20 | 45 | 0 |
| Easy | — | — | 2:05 | — | 0 | 0 | 26 | 21 | 0 |

## How it was checked

- **Each item, step by step,** with a deterministic simulation (`__game.dev.advance`):

  | Item | Result |
  |---|---|
  | Soothing Salve | +96 health in 2 s; stopped by damage |
  | Shadowstep Dagger | locked after damage; blinks exactly 12 |
  | Cyclone Staff | target takes 0 damage from a raze; lasts 2.2 s |
  | Avatar Totem | 6 s immunity, 0 damage |
  | Veil Blade | invisible to bots, 1.28× speed, 290-damage revealing raze |
  | Soul Wand | +1 charge per enemy raze; heals 30 per charge |
  | Abyssal Scepter | marked hit 219 vs 170 unmarked; cooldown 2.21 s |

- **Purchases:** recipe upgrade (boots → treads), stacking, inventory full, max health and speed totals, and gold totals all matched.
- **Visuals:** screenshots of every effect taken in headless Chrome, muted.
- **Performance** (headless Chrome on the M4 GPU, 1920×1080 at 1.5×, 7 Hard bots): Scourge Pit GPU 3.6 ms, River 4.1 ms, logic 1.3 ms, no long tasks.

## Not done yet

- Bots don't play around enemy items, for example they don't save a raze for when an Avatar Totem ends.
- Wards don't reveal Veil Blade users. In DotA that needs a Sentry Ward, which is not in this set.
- No courier or stash: you can buy anywhere with B. That suits a fast arena game, but it isn't DotA's walk-to-the-shop rule.
