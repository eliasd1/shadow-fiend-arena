# Shadow Fiend Arena

A browser remake of the classic Warcraft 3 "Shadow Fiend Wars" raze duel. Raze your rivals, harvest their souls and unleash the Requiem. Play alone against bots, or invite friends online.

**Play:** https://eliasd1.github.io/shadow-fiend-arena/game/play.html

You can also download `game/play.html` and open it by double-click. It works offline.

## Controls

| Key | Action |
|---|---|
| Right-click | Move |
| Z / X / C | Near / mid / far raze (fires the way you face) |
| R | Requiem of Souls (also fires when you die) |
| 1–6 | Use item. Blink, ward and cyclone aim first: left-click to cast, right-click or Esc to cancel |
| B | Shop |
| S | Stop |
| M | Mute |
| Esc | Menu |

Drag items between inventory slots to rearrange them. Right-click an item at a Soul Merchant to sell it.

## Online play

Press **HOST ONLINE**, send the invite link or code to friends, and press **PLAY** when they show up in the lobby. Bots fill the empty slots, up to 8 heroes. See [ONLINE.md](ONLINE.md).

## Building

`python3 build.py` inlines every script and stylesheet into the single file `game/play.html`.

## Credits

- Announcer voice: "Announcer kill sounds" by TripleSnail, recorded by Antti Saari, [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) ([OpenGameArt](https://opengameart.org))
- [Three.js](https://threejs.org) r147, MIT License
- [PeerJS](https://peerjs.com) 1.5.4 by Michelle Bu, Eric Zhang and contributors, MIT License
- Hero and prop models made with [Meshy](https://www.meshy.ai)

This is a fan project inspired by the Warcraft 3 custom map. It uses no Blizzard or Valve assets.
