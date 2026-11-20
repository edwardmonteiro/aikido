# Ring Riot — arcade pixel-art wrestling

A small, original side-view wrestling game for phones and desktops. It's built on
an open-source engine, and every piece of art and sound is drawn by code.

**Play:** open `index.html` from any static server, for example
`python -m http.server -d docs` and then `/ring-riot/`. Once `main` is deployed it also runs
from the repo's GitHub Pages site at `/ring-riot/`.

## How to play

Choose one of 4 wrestlers and beat 3 CPU opponents, each harder than the last.
You win a match by **pinfall** (a 3-count) or on health when the timer runs out.

| Action | Touch | Keyboard | Gamepad |
|---|---|---|---|
| Move (8-way, ring depth) | left stick | arrows / WASD | stick / d-pad |
| Hit (press 3× for a combo, the 3rd knocks down) | HIT | J / Z | X |
| Grab · pin a downed opponent | GRAB | K / X | B |
| Jump (HIT in the air = dropkick) | JUMP | L / C / Space | A |
| Pause | `II` | Enter / Esc | Start |

**While you hold a grab:** HIT = headbutt · JUMP = suplex · GRAB = throw.
**When you're grabbed or pinned:** mash the buttons to break free or kick out.
The less health you have, the harder it is to escape.

## What's in it

| Part | What / license |
|---|---|
| Engine | [Phaser 3.90](https://phaser.io), MIT, copied into `vendor/` |
| Font | [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P), SIL OFL 1.1, copied into `vendor/` |
| Sprites, crowd, ring, portraits | generated at runtime from skeletal poses (`js/sprites.js`) and original to this project |
| Sound effects | synthesized with WebAudio (`js/audio.js`), no audio files |
| Controls | `js/controls.js`: touch stick and buttons, keyboard and gamepad feed one input layer |

There's no build step and no network requests, so it works offline.
It can be added to the home screen (PWA manifest) and plays in landscape.

```
index.html          page, font, rotate-device overlay
js/sprites.js       roster + pose → pixel-art generator
js/fighter.js       fighter state machine (move, hit, grab, throw, knockdown)
js/game.js          scenes: title, select, match (AI, pin, HUD), champion
js/controls.js      unified input
js/audio.js         synth SFX
```
