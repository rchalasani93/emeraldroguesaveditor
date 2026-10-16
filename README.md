# Emerald Rogue Save Editor

[![Deploy](https://github.com/rchalasani93/emeraldroguesaveditor/actions/workflows/pages.yml/badge.svg)](https://github.com/rchalasani93/emeraldroguesaveditor/actions/workflows/pages.yml) [![CodeQL](https://github.com/rchalasani93/emeraldroguesaveditor/actions/workflows/codeql.yml/badge.svg)](https://github.com/rchalasani93/emeraldroguesaveditor/actions/workflows/codeql.yml)

**Use it online: https://rchalasani93.github.io/emeraldroguesaveditor/**

A browser-based save editor for **Pokémon Emerald Rogue EX** (2.1.x). Open your `.sav`, edit it, download a fixed-up copy. Everything runs locally in your browser — nothing is uploaded.

## What you can edit

- **Trainer** — name, Trainer ID / Secret ID, money, play time, Pokémon Hub name
- **Party** — create, edit, copy/paste or delete Pokémon (6 slots)
- **PC boxes** — all 10 boxes × 30 slots, plus box names
- **Pokémon** — species (all 1,500+ EX species and forms), nickname, level, nature, ability (incl. hidden), gender, shiny, held item, Poké Ball, friendship, IVs, EVs, moves, PP and PP Ups, egg flag, Gigantamax factor, OT name/ID, met level; party stats are recalculated automatically
- **Bag** — any item in any quantity, auto-sorted into the right pocket the way the game expects
- **PC items** — the 50-slot item storage
- **Unlocks** — complete or unlock all quests (or set each one), fill the Pokédex (seen / caught / shiny), unlock hub upgrades in areas you've built, master every Pokémon
- **Bulk tools** — add every item (or every item in a pocket), max all quantities, max bag size, fill boxes with one of each species
- **Flags & vars** — every named story flag and variable, searchable (e.g. the `SYS_RIDING_*` riding unlocks)

Section checksums and Pokémon checksums/encryption are rebuilt on download.

## Use it

1. Save **in-game** (not a save state) and close the emulator, then back up your `.sav`.
2. Open `index.html` in a browser (or the GitHub Pages site, see below) and drop your save on the page.
3. Make your edits. In the Pokémon editor press **Save to slot** to keep changes.
4. Click **Download edited save** and put the file back where your emulator expects it (same file name).

### Deployment

Every push to `main` runs the tests and deploys the site to GitHub Pages (`.github/workflows/pages.yml`). Pages must be set to *Source: GitHub Actions* in Settings → Pages. CodeQL scans the code weekly and on every push, and Dependabot keeps the workflow actions up to date.

## Notes and limits

- Built for the **EX (expansion)** build. The save's Rogue header is checked; a warning appears if the save looks like the vanilla build or a different version.
- Emerald Rogue uses a flat EXP curve (300 EXP per level); levels are set accordingly.
- Stats are computed from the standard base stats. If you play with rebalanced stats, the game fixes them the next time it recalculates.
- During a run, your hub party is kept in Rogue's own save block; this editor edits the party you are currently carrying.
- Completing quests marks their rewards as ready; collect them at the quest board in game to receive money, building supplies and the features they unlock.
- Hub areas aren't added by the editor because the game places them on the hub map; build them in game, then unlock their upgrades here.
- Run state and difficulty settings are not edited.

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
