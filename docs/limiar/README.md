# LIMIAR — A Última Sombra (vertical slice, Ato I)

A 2.5D fighting adventure in pixel art, playable in a phone browser (landscape)
and on desktop. It is built from the *Game Design Bible* LIMIAR GDD 1.0. As the
bible recommends in §12, this is the **vertical slice**: Act I, stages 01–04,
ending with the **Vigia de Bronze** boss fight and the **Vincular / Dissipar** choice.

**Play:** serve the folder with any static server
(`python -m http.server -d docs`, then open `/limiar/`). Once `main` is deployed,
it also runs from the repo's GitHub Pages site at `/limiar/`. No build step and no
network requests; it works offline and can be installed as a PWA.

## Controls

| Action | Touch | Keyboard | Gamepad |
|---|---|---|---|
| Move (side + depth) | left stick | arrows / WASD | stick / d-pad |
| Soco (punch) | SOCO | J / Z | X |
| Chute (kick) | CHUTE | K / X | Y |
| Defesa (hold) · **parry** = block ≤150 ms before the hit | DEFESA | L / C / Shift | B / LB / RB |
| Esquiva (dodge, i-frames) | DEFESA + direction | L + arrow | B + stick |
| Especial "Eco" (costs 30 ECO) | ECO | I / V / Space | A |
| Pause | `II` | Enter / Esc | Start |

Combos: **P-P-K** knocks down · **K-K-P** breaks guard.

## What's implemented from the GDD

| GDD | In the game |
|---|---|
| §3 opening cutscene (3 screens) | `Intro`, typewriter text, skippable |
| §5 Act I — stages 01–04 | street with the lanterns going out + the courier · Armazém 9 with steel doors and crates · rooftops in the rain + the Duelista + the optional **Memória 1** · Portão do Sino (boss) |
| §6 Vigia de Bronze | phase 1: hammer raised **0.7 s** + yellow mark on the ground · phase 2 (≤50%): the bell gives **5 s armour**, and parrying breaks it → **2 s vulnerable** |
| §7 choice at 20% HP | Vincular (−50 ECO, counts toward the true ending) / Dissipar (+200 aço), saved in `choices.boss_bronze` |
| §8 combat | startup → active → recovery per move; damage only on overlap **at the same depth**; 60–90 ms hitstop; 120 ms buffer; ~0.2 s dodge i-frames; auto-face the nearest target; P 6 / K 10 / heavy 16; 100 HP |
| §8 enemies | **Errante** (2 short hits) · **Guarda** (frontal shield blocks punches, breaks to kicks or attacks from behind) · **Duelista** (parries the 3rd repeated move) · FSM approach → telegraph → attack → recover → reposition, max 2 attackers at once |
| §9 sprites | original silhouettes with rim light in the Act I colour, pivot at the feet, fixed scale per character; Aren's red scarf is a live Verlet chain |
| §11 save | `localStorage` (stages, flags, aço, ECO, memórias, choices, perks) |

All data comes from `data/levels.json`, copied as delivered (`js/levels.js` holds the
same data for running from `file://`). Acts II–VI appear on the map as "em produção".

**Deviation from the GDD:** stage 03 calls for a jump. This slice uses the dodge
instead, and the stage's reward ("Salto aprimorado") becomes "Esquiva aprimorada".

## Open source

| Part | License |
|---|---|
| Phaser 3.90 engine (`vendor/`) | MIT |
| Press Start 2P font (`vendor/`) | SIL OFL 1.1 |
| Sprites, scenery, portraits, effects | generated in code (`js/art.js`), original |
| Sound effects | WebAudio synth (`js/audio.js`) |
| Code | same license as the repository |

```
js/levels.js    GDD data (24 stages, acts, bosses, choices, endings)
js/art.js       silhouettes, 3-layer parallax, portraits, effects
js/combat.js    Actor: frame data, hits, block/parry/dodge, enemy and boss AI
js/stages.js    Act I script (events, waves, locks) + save
js/scenes.js    Título, Abertura, Mapa, Fase, Fim de Ato, diálogos, escolha
js/controls.js  touch (4 buttons + stick), keyboard, gamepad
js/audio.js     synthesized SFX
```
