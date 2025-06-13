import { LoadSnap, SaveGameState } from "./snapshot"

/** @noSelfInFile */

const oldSetParent = CBaseEntity.SetParent
CBaseEntity.SetParent = function(this,parent:CDOTA_BaseNPC,attach){
    oldSetParent.call(this,parent,attach)
    this['GetParent'] = {SetParent:{parent:parent.entindex(),attach}}
}

const oldFollowEntityMerge = CBaseEntity.FollowEntityMerge
CBaseEntity.FollowEntityMerge = function(this,parent:CDOTA_BaseNPC,attach){
    oldFollowEntityMerge.call(this,parent,attach)
    this['FollowEntityMergeGet'] = {FollowEntityMerge:{parent:parent.entindex(),attach}}
}

export default{
    SaveCryso:()=>{
        SaveGameState()
    },
    LoadCryso:()=>{
        LoadSnap()
    }
}