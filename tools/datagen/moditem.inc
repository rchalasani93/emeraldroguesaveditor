const u16 gRogueBake_EvoItems[] =
{
	222,
	223,
	224,
	225,
	226,
	227,
	228,
	229,
	230,
	231,
	232,
	233,
	234,
	235,
	236,
	237,
	238,
	239,
	240,
	241,
	242,
	243,
	244,
	245,
	246,
	247,
	248,
	409,
	410,
	452,
	476,
	503,
	504,
	774,
	777,
	778,
	779,
	806,
	808,
	811,
	812,
	813,
	825,
	827,
	835,
	836,
	837,
};
const u16 gRogueBake_EvoItems_Count = ARRAY_COUNT(gRogueBake_EvoItems);

static u16 SanitizeItemId(u16 itemId)
{
#ifdef ROGUE_FEATURE_REMOVE_HIDDEN_MACHINES
    if(itemId >= ITEM_HM01 && itemId <= ITEM_HM08)
        return ITEM_NONE;
#endif

    if (itemId >= ITEMS_COUNT)
        return ITEM_NONE;
    else
        return itemId;
}

static u16 BinarySearchForItem(u16 item, u16 const* data, u16 count)
{
    u16 minIndex, maxIndex, currIndex;

    if(count == 0)
        return count;

    // Binary search for item
    minIndex = 0;
    maxIndex = count - 1;
    do
    {
        currIndex = (maxIndex + minIndex) / 2;

        if(data[currIndex] == item)
            return currIndex;
        
        if(item < data[currIndex])
            maxIndex = currIndex;
        else
        {
            if(minIndex == currIndex)
                ++currIndex;

            minIndex = currIndex;
        }
    }
    while(minIndex != maxIndex);

    // Final check
    if(data[currIndex] == item)
        return currIndex;

    // Failed to find
    return count;
}

static bool8 IsCharmItem(u16 itemId)
{
    return (itemId >= FIRST_ITEM_CHARM && itemId <= LAST_ITEM_CHARM) || (itemId >= FIRST_ITEM_CURSE && itemId <= LAST_ITEM_CURSE);
}

static bool8 Rogue_IsEvolutionItem2(u16 itemId){ return BinarySearchForItem(itemId, gRogueBake_EvoItems, gRogueBake_EvoItems_Count) != gRogueBake_EvoItems_Count; }

void My_ModifyItem(u16 itemId, struct Item* outItem)
{
    itemId = SanitizeItemId(itemId);
    AGB_ASSERT(itemId < ITEMS_COUNT);

    // Rogue items copy in parts
    //
    if(itemId >= ITEM_ROGUE_ITEM_FIRST && itemId <= ITEM_ROGUE_ITEM_LAST)
    {
        const struct RogueItem* rogueItem;
        bool8 isValidItem;

        if(itemId >= ITEM_TR01 && itemId <= ITEM_TR50)
        {
            // Copy from first entry, as these items are going to be dynamic anyway
            rogueItem = &gRogueItems[ITEM_TR01 - ITEM_ROGUE_ITEM_FIRST];
            isValidItem = TRUE;
        }
        else
        {
            rogueItem = &gRogueItems[itemId - ITEM_ROGUE_ITEM_FIRST];
            isValidItem = rogueItem->itemId == itemId;
        }

        if(isValidItem)
        {
            //outItem->itemId = itemId;
            outItem->holdEffect = rogueItem->holdEffect;
            outItem->holdEffectParam = rogueItem->holdEffectParam;
            //outItem->registrability = rogueItem->registrability;
            outItem->pocket = rogueItem->pocket;
            outItem->type = rogueItem->type;
            outItem->fieldUseFunc = rogueItem->fieldUseFunc;
            outItem->battleUsage = rogueItem->battleUsage;
            outItem->secondaryId = rogueItem->secondaryId;
            outItem->importance = 0;

            if(IsCharmItem(itemId))
            {
                // Early out here for charms (We can end up in an infinite loop below)
                outItem->importance = 1;
                return;
            }

            if(outItem->pocket == POCKET_KEY_ITEMS)
            {
                outItem->importance = 1;
            }
        }
        else
        {
            itemId = ITEM_NONE;
            memcpy(outItem, &gItems[ITEM_NONE], sizeof(struct Item));
        }
    }
    else
    {
        memcpy(outItem, &gItems[itemId], sizeof(struct Item));
    }

    if(itemId == ITEM_NONE)
        return;

    // Range edits
    if(itemId >= ITEM_HP_UP && itemId <= ITEM_PP_MAX)
    {
        outItem->pocket = POCKET_MEDICINE;
    }

#ifdef ROGUE_EXPANSION
    if(itemId >= ITEM_X_ATTACK && itemId <= ITEM_GUARD_SPEC)
#else
    if(itemId >= ITEM_GUARD_SPEC && itemId <= ITEM_X_SPECIAL)
#endif
    {
        outItem->pocket = POCKET_MEDICINE;
    }

    if(outItem->pocket == POCKET_ITEMS && 
        (
            outItem->fieldUseFunc == ItemUseOutOfBattle_Medicine ||
            outItem->fieldUseFunc == ItemUseOutOfBattle_ReduceEV ||
            outItem->fieldUseFunc == ItemUseOutOfBattle_SacredAsh ||
            outItem->fieldUseFunc == ItemUseOutOfBattle_PPRecovery ||
            outItem->fieldUseFunc == ItemUseOutOfBattle_PPUp ||
            outItem->fieldUseFunc == ItemUseOutOfBattle_RareCandy
        ))
    {
        outItem->pocket = POCKET_MEDICINE;
    }

    if((itemId >= FIRST_BERRY_INDEX && itemId <= LAST_BERRY_INDEX))
    {
        outItem->pocket = POCKET_BERRIES;
    }


    // Don't move evo items into held item pocket
    if(Rogue_IsEvolutionItem2(itemId))
    {
        outItem->pocket = POCKET_ITEMS; 

        // Become evo items
        outItem->type = ITEM_USE_PARTY_MENU;
        outItem->fieldUseFunc = ItemUseOutOfBattle_EvolutionStone;

    }
    else if(outItem->holdEffect != 0 && outItem->pocket != POCKET_BERRIES)
    {
        // Don't move evo items into held item pocket
        outItem->pocket = POCKET_HELD_ITEMS;
    }

#ifdef ROGUE_EXPANSION
    if(IS_MEGA_STONE(itemId))
    {
        outItem->pocket = POCKET_STONES;
    }

    if(itemId >= ITEM_NORMALIUM_Z && itemId <= ITEM_ULTRANECROZIUM_Z)
    {
        outItem->pocket = POCKET_STONES;
    }

    if(itemId >= ITEM_DOUSE_DRIVE && itemId <= ITEM_CHILL_DRIVE)
    {
        outItem->pocket = POCKET_STONES;
    }

    if(itemId >= ITEM_FLAME_PLATE && itemId <= ITEM_PIXIE_PLATE)
    {
        outItem->pocket = POCKET_STONES;
    }

    if(itemId >= ITEM_FIRE_MEMORY && itemId <= ITEM_FAIRY_MEMORY)
    {
        outItem->pocket = POCKET_STONES;
    }

    if(itemId >= ITEM_ADAMANT_CRYSTAL && itemId <= ITEM_LUSTROUS_GLOBE)
    {
        outItem->pocket = POCKET_STONES;
    }

    if(itemId >= ITEM_CORNERSTONE_MASK && itemId <= ITEM_HEARTHFLAME_MASK)
    {
        outItem->pocket = POCKET_STONES;
    }

    if((itemId >= ITEM_BUG_TERA_SHARD && itemId <= ITEM_WATER_TERA_SHARD) || itemId == ITEM_STELLAR_TERA_SHARD)
    {
        outItem->type = ITEM_USE_PARTY_MENU,
        outItem->fieldUseFunc = ItemUseOutOfBattle_TeraShard,
        outItem->pocket = POCKET_STONES;
    }

    if(itemId == ITEM_MAX_MUSHROOMS)
    {
        outItem->type = ITEM_USE_PARTY_MENU,
        outItem->battleUsage = 0,
        outItem->fieldUseFunc = ItemUseOutOfBattle_MaxMushroom,
        outItem->pocket = POCKET_STONES;
    }
#endif

    // Individual items
    switch(itemId)
    {
        case ITEM_SACRED_ASH:
            outItem->pocket = POCKET_KEY_ITEMS;
            break;

        case ITEM_ESCAPE_ROPE:
            outItem->pocket = POCKET_ITEMS;
            break;

        case ITEM_NUGGET:
        case ITEM_PEARL:
        case ITEM_BIG_PEARL:
        case ITEM_STARDUST:
        case ITEM_STAR_PIECE:
            outItem->holdEffect = 0;
            break;
    
        case ITEM_TOWN_MAP:
            outItem->type = ITEM_USE_FIELD;
            outItem->fieldUseFunc = ItemUseOutOfBattle_WorldMap;
            break;

        case ITEM_SOUL_DEW:
#ifdef ROGUE_EXPANSION
            outItem->pocket = POCKET_STONES;
#endif
            break;

#ifdef ROGUE_EXPANSION
        case ITEM_ABILITY_CAPSULE:
        case ITEM_ABILITY_PATCH:
            outItem->pocket = POCKET_MEDICINE;
            break;

        case ITEM_RED_ORB:
        case ITEM_BLUE_ORB:
            outItem->pocket = POCKET_STONES;
            break;

        // Weaker versions
        case ITEM_ADAMANT_ORB:
        case ITEM_LUSTROUS_ORB:
        case ITEM_GRISEOUS_ORB:
            outItem->pocket = POCKET_STONES;
            break;

        case ITEM_RUSTED_SWORD:
        case ITEM_RUSTED_SHIELD:
            outItem->pocket = POCKET_STONES;
            break;
#endif
    }

    // Check we're not a charm/curse otherwise we can get infinite loops here
    {
        if(outItem->pocket == POCKET_POKE_BALLS)
        {
            if(IsCurseActive(EFFECT_SNAG_TRAINER_MON) && !FlagGet(FLAG_ROGUE_IN_SNAG_BATTLE))
                outItem->battleUsage = 0;
        }
        else
        {
            if(IsCurseActive(EFFECT_BATTLE_ITEM_BAN))
                outItem->battleUsage = 0;
        }
    }
}