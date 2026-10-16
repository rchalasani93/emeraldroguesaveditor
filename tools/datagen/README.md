# Regenerating game data

`js/data.js` (species, moves, abilities, natures, items and their bag pockets) is generated from the Emerald Rogue source using the game's own host-side "baking" setup.

```sh
git clone -b expansion https://github.com/Pokabbie/pokeemerald-rogue.git rogue
cd rogue/tools/Pokabbie/Build/QueryBaker
cp /path/to/this/repo/tools/datagen/{dump.c,spnames.c,moditem.inc,layout.c} .
# a stub for a header generated at build time
mkdir -p ../../../../include/constants/generated
printf '#define QUEST_SAVE_COUNT 1\n#define QUEST_ID_COUNT 1\n' > ../../../../include/constants/generated/quest_consts.h

FLAGS="-std=gnu17 -w -no-pie -I . -I ../../../../include -I ../../../../gflib -I ../../../../src -D ROGUE_BAKING=1 -D ROGUE_EXPANSION=1 -Wl,--unresolved-symbols=ignore-all"
gcc $FLAGS dump.c -o dump && ./dump > /path/to/this/repo/tools/datagen/gamedata.json
gcc $FLAGS spnames.c -o spnames && ./spnames > /path/to/this/repo/tools/datagen/spnames.txt
cd /path/to/this/repo && python3 tools/datagen/build_data.py
```

- `dump.c` prints species info, move names/PP, abilities, natures and items as JSON.
- `moditem.inc` is `Rogue_ModifyItem` (and helpers) lifted from `src/rogue_baked.c`, so item pockets match the game.
- `spnames.c` maps species IDs to their `SPECIES_*` constants, used to label forms ("Samurott (Hisuian)").
- `layout.c` builds a reference Pokémon from the real structs; its output is `tests/fixture-pokemon-plain.hex`.
- `offsets.c` prints SaveBlock offsets. Compile it with `arm-none-eabi-gcc -mthumb -mabi=apcs-gnu -march=armv4t -S` (the ABI matters: it pads small structs to 4 bytes).
