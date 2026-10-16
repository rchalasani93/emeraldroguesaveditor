#include "BakeHelpers.h"
#include <stdio.h>
const union AnimCmd sAnim_GeneralFrame0[] = {};
#include "data/graphics/pokemon.h"
#include "data/pokemon_graphics/front_pic_anims.h"
#include "data/pokemon/form_change_tables.h"
#include "data/pokemon/form_change_table_pointers.h"
#include "data/pokemon/form_species_tables.h"
#include "data/pokemon/species_info.h"
#include "data/battle_moves.h"
#include "data/text/move_names.h"
#include "data/text/abilities.h"
#include "data/text/nature_names.h"
#include "item.h"
#include "item_use.h"
#include "item_menu.h"
#include "party_menu.h"
#include "data/text/item_descriptions.h"
#include "data/items.h"
#include "data/rogue_items.h"


static volatile int gStubSink;
#define STUB(n, k) void n(u8 taskId){ gStubSink = k; }
STUB(ItemUseOutOfBattle_EvolutionStone,1) STUB(ItemUseOutOfBattle_MaxMushroom,2) STUB(ItemUseOutOfBattle_Medicine,3)
STUB(ItemUseOutOfBattle_PPRecovery,4) STUB(ItemUseOutOfBattle_PPUp,5) STUB(ItemUseOutOfBattle_RareCandy,6)
STUB(ItemUseOutOfBattle_ReduceEV,7) STUB(ItemUseOutOfBattle_SacredAsh,8) STUB(ItemUseOutOfBattle_TeraShard,9) STUB(ItemUseOutOfBattle_WorldMap,10)
bool8 IsCurseActive(u8 e){ return FALSE; }
bool8 FlagGet(u16 f){ return FALSE; }
#include "rogue_charms.h"
#include "moditem.inc"

static void js(const u8* s){ putchar('"'); for(;*s;s++){ if(*s=='"'||*s=='\\') putchar('\\'); if(*s>=32) putchar(*s);} putchar('"'); }
int main(void){
  int i;
  printf("{\"species\":[\n");
  for(i=0;i<NUM_SPECIES;i++){ const struct SpeciesInfo*s=&gSpeciesInfo[i];
    printf("%s[",i?",\n":""); js(s->speciesName);
    printf(",%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d]", s->baseHP,s->baseAttack,s->baseDefense,s->baseSpeed,s->baseSpAttack,s->baseSpDefense,s->growthRate,s->genderRatio,s->abilities[0],s->abilities[1],s->abilities[2],s->types[0],s->types[1],s->natDexNum);
  }
  printf("],\n\"moves\":[");
  for(i=0;i<MOVES_COUNT;i++){ if(i) putchar(','); printf("[");js(gMoveNames[i]);printf(",%d,%d,%d,%d]",gBattleMoves_Mainline[i].pp,gBattleMoves_Mainline[i].type,gBattleMoves_Mainline[i].power,gBattleMoves_Mainline[i].accuracy); }
  printf("],\n\"abilities\":[");
  for(i=0;i<ABILITIES_COUNT;i++){ if(i) putchar(','); js(gAbilityNames[i]); }
  printf("],\n\"natures\":[");
  for(i=0;i<NUM_NATURES;i++){ if(i) putchar(','); js(gNatureNamePointers[i]); }
  printf("],\n\"items\":[");
  for(i=0;i<ITEMS_COUNT;i++){ struct Item it; const u8* nm; if(i) putchar(',');
    My_ModifyItem(i,&it);
    if(i>=ITEM_ROGUE_ITEM_FIRST && i<=ITEM_ROGUE_ITEM_LAST) nm = gRogueItems[i-ITEM_ROGUE_ITEM_FIRST].name; else nm = gItems[i].name;
    printf("[");js(nm);printf(",%d,%d]",it.pocket,(i>=ITEM_ROGUE_ITEM_FIRST && i<=ITEM_ROGUE_ITEM_LAST)?(gRogueItems[i-ITEM_ROGUE_ITEM_FIRST].itemId==i):1);}
  printf("]}\n");
  return 0;
}
