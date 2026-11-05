# Playing online with friends

1. Open the game at https://eliasd1.github.io/shadow-fiend-arena/game/play.html (or your own copy of `game/play.html`), type your name and press **HOST ONLINE**.
2. Send your friends the **invite code**, for example `NDY7QC`. Or press **Copy invite link** and send them that.
3. Each friend opens their own copy of `play.html`, presses **JOIN A FRIEND** and types the code. Their names appear in your lobby.
4. You pick the map, kills, fog and number of bots, then press **PLAY**. Up to 8 heroes can play: you, up to 7 friends, and bots in the empty slots.

## How it works

- **Connection:** the free [PeerJS](https://peerjs.com) lobby server (MIT License, bundled into `play.html`) only introduces the browsers to each other. After that the game runs directly between the players' browsers (WebRTC), so all of you need an internet connection.
- **Who runs the match:** the host. Each friend sends their clicks and key presses to the host. The host sends back the state of every hero 20 times a second, plus every raze, hit, death, rune, item and announcement, and the friend's screen plays the same effects.
- **Joining late:** a friend who joins after the match has started takes over a bot's hero, or gets a new hero if there's room.
- **Leaving:** if a friend leaves, a bot takes over their hero.
- **If the host leaves,** the match ends for everyone.
- **Esc doesn't pause online.** It only shows the menu, and the match keeps running. If the host hides their tab, the match also keeps running, slowed down; whether that holds depends on how the browser treats hidden tabs.

## Limits

- **Invite link:** the link opens straight into the game when you host from the website above. If you host from a copy on your own disk, the link points at your own computer, so friends should type the code instead.
- **Strict networks:** some networks (strict company or school firewalls, some mobile carriers) block direct connections. Getting through those needs a relay ("TURN") server, which isn't set up.
- **Delay:** your own hero responds after one round trip to the host. Other heroes are shown about 0.1 s behind, to keep their movement smooth.

## Test

`node tools/nettest.mjs <url-of-play.html> <outDir> [guests]` checks all of this automatically. It runs one muted headless Chrome, with a host tab and guest tabs joined through the real lobby server:
- guests see the match;
- their moves and razes happen on the host;
- refused actions report back to the guest;
- positions stay in sync;
- a bot takes over a hero whose player left;
- no tab has JavaScript errors.
