# Emerald Rogue Save Editor

A browser-based save editor for **Pokémon Emerald Rogue EX** (2.1.x). Open your `.sav`, edit it, download a fixed-up copy. Everything runs locally in your browser — nothing is uploaded.

## What you can edit

- **Trainer** — name, Trainer ID / Secret ID, money, play time, Pokémon Hub name
- **Party** — create, edit, copy/paste or delete Pokémon (6 slots)
- **PC boxes** — all 10 boxes × 30 slots, plus box names
- **Pokémon** — species (all 1,500+ EX species and forms), nickname, level, nature, ability (incl. hidden), gender, shiny, held item, Poké Ball, friendship, IVs, EVs, moves, PP and PP Ups, egg flag, Gigantamax factor, OT name/ID, met level; party stats are recalculated automatically
- **Bag** — any item in any quantity, auto-sorted into the right pocket the way the game expects
- **PC items** — the 50-slot item storage
- **Flags & vars** — raw story flags and variables for advanced users

Section checksums and Pokémon checksums/encryption are rebuilt on download.

## Use it

1. Save **in-game** (not a save state) and close the emulator, then back up your `.sav`.
2. Open `index.html` in a browser (or the GitHub Pages site, see below) and drop your save on the page.
3. Make your edits. In the Pokémon editor press **Save to slot** to keep changes.
4. Click **Download edited save** and put the file back where your emulator expects it (same file name).

### Host it on GitHub Pages

Settings → Pages → *Deploy from a branch* → `main` / `(root)`. The editor is plain HTML/CSS/JS with no build step.

## Notes and limits

- Built for the **EX (expansion)** build. The save's Rogue header is checked; a warning appears if the save looks like the vanilla build or a different version.
- Emerald Rogue uses a flat EXP curve (300 EXP per level); levels are set accordingly.
- Stats are computed from the standard base stats. If you play with rebalanced stats, the game fixes them the next time it recalculates.
- During a run, your hub party is kept in Rogue's own save block; this editor edits the party you are currently carrying.
- Rogue-specific data (quests, hub upgrades, run state, difficulty settings) is not edited.

## How the format was worked out

Offsets come from the [pokeemerald-rogue](https://github.com/Pokabbie/pokeemerald-rogue) `expansion` branch, compiled with `arm-none-eabi-gcc -mabi=apcs-gnu` (the game's real struct layout), and checked against a real 2.1.x save:

| Thing | Location |
| --- | --- |
| Sector | 0x1000 bytes: 0xFF4 data, id @0xFF4, checksum @0xFF6, signature `0x08012025` @0xFF8, counter @0xFFC |
| Slots | sectors 0–13 and 14–27; the valid slot with the higher counter is used |
| SaveBlock2 | name @0x00, outfit @0x08, TID/SID @0x0A, play time @0x0E, encryption key @0x4C, hub name @0xEE4 |
| SaveBlock1 | party count @0x234, party @0x238 (6 × 104 bytes), money @0x4A8 (XOR key), PC items @0x4B0, bag @0x578 (450 slots, qty XOR key), flags @0x14D0, vars @0x15FC |
| Storage | boxes @0x04 (10 × 30 × 80 bytes), Rogue save block @0x5DC4, box names @0x8344 |

Pokémon use the expansion substruct layout (11-bit species, 11-bit held item, nature in `hiddenNatureModifier`, explicit shiny/gender bits). `tests/` verifies the bit layout against bytes produced by the game's own headers.

## Development

```sh
node tests/run-tests.js            # unit tests, no dependencies
python3 tools/datagen/build_data.py   # regenerate js/data.js from tools/datagen/*.json
```

See [`tools/datagen/README.md`](tools/datagen/README.md) for regenerating the species/move/item tables from the game source.

Unofficial fan tool. Not affiliated with Nintendo, Game Freak, The Pokémon Company or the Emerald Rogue team.
