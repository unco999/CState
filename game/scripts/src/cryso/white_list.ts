import { blackList } from "./black_list"

export const whiteClassList:Set<string> = new Set(["prop_dynamic","npc_dota_barracks","npc_dota_tower"])


export const EntityFilter = (entity:CBaseEntity) =>{
    return !blackList.has(entity.GetName()) && (
        whiteClassList.has(entity.GetClassname()) || 
        entity.IsBaseNPC() ||
        entity.IsInstance(CDOTABaseAbility) ||
        entity.IsInstance(CDOTA_Item)
     )
}

export const Speciel:Set<string> = new Set(["neutral_upgrade","twin_gate_portal_warp","ability_lamp_use","creep_irresolute","creep_piercing","ability_capture","special_bonus_attributes"])
