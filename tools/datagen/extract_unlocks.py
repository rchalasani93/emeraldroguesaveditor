#!/usr/bin/env python3
"""Extracts quests, hub upgrades, hub areas, story flags and vars from the
Emerald Rogue source tree into tools/datagen/unlocks.json.

Usage:
    python3 tools/datagen/extract_unlocks.py <rogue-source-dir> <path-to-customjson> <flagsvars.txt>

<path-to-customjson> is the quest exporter built from
tools/Pokabbie/Build/CustomJson in the Rogue source (run `make` there).
<flagsvars.txt> is the output of the compiled flagsvars.c (see README.md).
"""
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
src, customjson, flagsvars = sys.argv[1], sys.argv[2], sys.argv[3]

# ---------------------------------------------------------------- quests
tmp = tempfile.mkdtemp()
qc = os.path.join(tmp, "q.c")
subprocess.check_call([customjson, "quests_c", "src/data/rogue/quests.json", qc], cwd=src, stdout=subprocess.DEVNULL)
qi = subprocess.check_output(["gcc", "-E", "-P", "-DROGUE_EXPANSION=1", "-x", "c", qc]).decode("utf-8", "replace")

titles = dict(re.findall(r'sTitle_(\w+)\[\] = _\("((?:[^"\\]|\\.)*)"\)', qi))
entries = qi[qi.index("sQuestEntries[]"):]
quests = []
for qid, key, flags in re.findall(r'\[QUEST_ID_(\w+)\]\s*=\s*\{\s*\.title = sTitle_(\w+),.*?\.flags = ([^,]*),', entries, re.S):
    if "IS_MAIN_QUEST" in flags or "MAIN_QUEST_DEFAULT" in flags:
        cat = "Main"
    elif "CHALLENGE" in flags:
        cat = "Challenge"
    elif "MON_MASTERY" in flags:
        cat = "Mastery"
    else:
        cat = "Side"
    quests.append([titles.get(key, qid.replace("_", " ").title()), cat, "UNLOCKED_BY_DEFAULT" in flags])

# ---------------------------------------------------------------- hub
consts = {}
for name, expr in re.findall(r'^#define (HUB_(?:AREA|UPGRADE)_\w+)\s+(.+?)\s*(?://.*)?$',
                             open(os.path.join(src, "include/constants/rogue_hub.h")).read(), re.M):
    consts[name] = expr


def ev(name):
    expr = consts[name]
    expr = re.sub(r'HUB_\w+', lambda m: str(ev(m.group(0))), expr)
    return int(eval(expr))


hub_src = open(os.path.join(src, "src/data/rogue_hub.h"), encoding="utf-8").read()
areas = [None] * ev("HUB_AREA_COUNT")
for key, body in re.findall(r'\[(HUB_AREA_\w+)\]\s*=\s*\{(.*?)\n    \},', hub_src[hub_src.index("{", hub_src.index("gRogueHubAreas[")) + 1:], re.S):
    m = re.search(r'\.areaName = _\("([^"]*)"\)', body)
    if key in consts and m and "CONN" not in key:
        areas[ev(key)] = m.group(1)
upgrades = [None] * ev("HUB_UPGRADE_COUNT")
for key, body in re.findall(r'\[(HUB_UPGRADE_\w+)\]\s*=\s*\{(.*?)\n    \},', hub_src[hub_src.index("{", hub_src.index("gRogueHubUpgrades[")) + 1:], re.S):
    name = re.search(r'\.upgradeName = _\("([^"]*)"\)', body).group(1)
    area = ev(re.search(r'\.targetArea = (HUB_AREA_\w+)', body).group(1))
    reqs = [ev(r) for r in re.findall(r'(HUB_UPGRADE_\w+)', re.search(r'\.requiredUpgrades = \{([^}]*)\}', body).group(1)) if r != "HUB_UPGRADE_NONE"]
    hidden = bool(re.search(r'\.isHidden = TRUE', body))
    upgrades[ev(key)] = [name, area, reqs, hidden]

# ---------------------------------------------------------------- legendaries
# RoguePokedex_IsSpeciesLegendary decides which Safari Zone slots a mon goes in
dex_src = open(os.path.join(src, "src/rogue_pokedex.c"), encoding="utf-8").read()
fn = dex_src[dex_src.index("bool8 RoguePokedex_IsSpeciesLegendary(u16 species)"):]
fn = fn[:fn.index("\n}\n")]
legendaries = re.findall(r'case (SPECIES_\w+):', fn[fn.index("switch(species)", fn.index("#endif")):])

# ---------------------------------------------------------------- flags / vars
flags, vars_ = {}, {}
for line in open(flagsvars):
    name, val = line.split()
    val = int(val)
    if name.startswith("FLAG_") and 0 < val < 2400:
        flags.setdefault(val, name[5:])
    elif name.startswith("VAR_") and 0x4000 <= val < 0x4100:
        vars_.setdefault(val - 0x4000, name[4:])

out = {
    "quests": quests,
    "hubAreas": areas,
    "hubUpgrades": upgrades,
    "legendaries": legendaries,
    "flags": sorted([[k, v] for k, v in flags.items()]),
    "vars": sorted([[k, v] for k, v in vars_.items()]),
}
json.dump(out, open(os.path.join(HERE, "unlocks.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("quests", len(quests), "areas", len(areas), "upgrades", len(upgrades), "flags", len(flags), "vars", len(vars_))
