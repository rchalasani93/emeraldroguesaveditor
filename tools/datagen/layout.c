#include "BakeHelpers.h"
#include <stdio.h>
int main(void){
  struct Pokemon m; memset(&m,0,sizeof m);
  struct BoxPokemon *b=&m.box;
  b->personality=0x12345678; b->otId=0xA1B2C3D4; b->language=2; b->hiddenNatureModifier=13; b->isBadEgg=0; b->hasSpecies=1; b->isEgg=0; b->markings=5;
  union PokemonSubstruct *s=b->secure.substructs; // canonical order 0..3 (we do not encrypt here)
  s[0].type0.species=1234; s[0].type0.heldItem1=1000; s[0].type0.teraType=17; s[0].type0.heldItem2=1; s[0].type0.experience=29999; s[0].type0.ppBonuses=0xE4; s[0].type0.friendship=222; s[0].type0.pokeball=26;
  s[1].type1.moves[0]=800; s[1].type1.moves[1]=1; s[1].type1.moves[2]=500; s[1].type1.moves[3]=848; s[1].type1.pp[0]=5; s[1].type1.pp[1]=35; s[1].type1.pp[2]=10; s[1].type1.pp[3]=64;
  s[2].type2.hpEV=252; s[2].type2.attackEV=4; s[2].type2.defenseEV=0; s[2].type2.speedEV=252; s[2].type2.spAttackEV=1; s[2].type2.spDefenseEV=2; s[2].type2.sheen=9;
  s[3].type3.pokerus=0x11; s[3].type3.metLocation=77; s[3].type3.metLevel=99; s[3].type3.metGame=3; s[3].type3.otGender=1;
  s[3].type3.hpIV=31; s[3].type3.attackIV=1; s[3].type3.defenseIV=30; s[3].type3.speedIV=2; s[3].type3.spAttackIV=29; s[3].type3.spDefenseIV=3; s[3].type3.isEgg=1; s[3].type3.gigantamaxFactor=1;
  s[3].type3.isShiny=5; s[3].type3.genderFlag=1; s[3].type3.tutorMoveLvl=3; s[3].type3.abilityNum=2; s[3].type3.modernFatefulEncounter=1;
  m.status=7; m.level=88; m.mail=0xFF; m.hp=300; m.maxHP=301; m.attack=302; m.defense=303; m.speed=304; m.spAttack=305; m.spDefense=306;
  printf("%d ", (int)sizeof m);
  for (int i=0;i<(int)sizeof m;i++) printf("%02x", ((unsigned char*)&m)[i]); printf("\n");
}
