// snapshot.ts
// 完整的游戏状态快照系统，支持捕获和恢复任意时间点的游戏状态
export namespace Tool{
    
    export function shuffle<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
          const j = RandomInt(1, i + 1) - 1; // Lua 索引从 1 开始，math.random 是闭区间
          const temp = array[i];
          array[i] = array[j];
          array[j] = temp;
        }
        return array;
    }


    export function resolveAbilityValues(ability: CDOTABaseAbility, rawValues: Record<string, string>, level: number = 1): Record<string, number> {
        const resolved: Record<string, number> = {}
    
        for (const key in rawValues) {
            const value = ability.GetLevelSpecialValueFor(key, level - 1) // 注意等级从0开始
            resolved[key] = value
        }
    
        return resolved
    }

    export function getAbilityValues(heroName: string, abilityName: string): Record<string, string> {
        const result: Record<string, string> = {}
    
        // 读取英雄 KV 文件
        const kvPath = `scripts/npc/heroes/${heroName}.txt`
        const heroKV = LoadKeyValues(kvPath) as Record<string, any>
    
        if (!heroKV) {
            print(`[getAbilityValues] Cannot find file: ${kvPath}`)
            return result
        }
    
        const root = heroKV[heroName]
        if (!root) {
            print(`[getAbilityValues] Root key '${heroName}' not found in file`)
            return result
        }
    
        const abilityValues = root["AbilityValues"]
        if (!abilityValues) {
            print(`[getAbilityValues] No 'AbilityValues' section in hero file`)
            return result
        }
    
        const abilityData = abilityValues[abilityName]
        if (!abilityData) {
            print(`[getAbilityValues] No data for ability '${abilityName}'`)
            return result
        }
    
        for (const [key, value] of pairs(abilityData)) {
            result[key as any] = tostring(value)
        }
    
        return result
    }
    
    export class Cache{
        private particle_ids:ParticleID[] = []
        private project_ids:ProjectileID[] = []
        private event_ids:EventListenerID[] = []
        private entities:EntityIndex[] = []

        
        constructor(){
        }
       

        static build(){
            const ins = new this()
            return ins
        }

        clear(){
            this.project_ids.forEach(e=>{
                ProjectileManager.DestroyLinearProjectile(e)
            })
            this.event_ids.forEach(e=>{
                StopListeningToGameEvent(e)
            })
            this.particle_ids.forEach(e=>{
                ParticleManager.DestroyParticle(e,true)
                ParticleManager.ReleaseParticleIndex(e)
            })
            this.entities.forEach(e=>{
                if(EntIndexToHScript(e).IsAlive()){
                    UTIL_RemoveImmediate(EntIndexToHScript(e))
                }
            })
        }

        // 或者更类型安全的方式 - 分开的添加方法
        addParticle(id: ParticleID): void {
            this.particle_ids.push(id)
        }
    
        addProjectile(id: ProjectileID): void {
            this.project_ids.push(id)
        }
    
        addEventListener(id: EventListenerID): void {
            this.event_ids.push(id)
        }
    
        addEntity(id: EntityIndex): void {
            this.entities.push(id)
        }
    
    }

    export const diagonalDirs: { dx: number; dy: number; dir: string }[] = [
        { dx: 0, dy: -1, dir: 'up' },
        { dx: 0, dy: 1, dir: 'down' },
        { dx: -1, dy: 0, dir: 'left' },
        { dx: 1, dy: 0, dir: 'right' },
        { dx: -1, dy: -1, dir: 'up-left' },
        { dx: 1, dy: -1, dir: 'up-right' },
        { dx: -1, dy: 1, dir: 'down-left' },
        { dx: 1, dy: 1, dir: 'down-right' }
    ];

      
    export const delay = (duration: number): Promise<void> => {
        return new Promise((res, rej) => {
            GameRules.GetGameModeEntity().SetThink(() => {
                res(void 0)
                return null
            }, undefined, DoUniqueString("Ctimer"), duration)
        })
    }

    export const delayfn = (duration: number, fn: Function) => {
        GameRules.GetGameModeEntity().SetThink(() => {
            fn()
            return null
        }, undefined, DoUniqueString("Ctimer"), duration)
    }

    
    export function RemoveWearables(unit: CDOTA_BaseNPC_Hero) {
        let hero = unit as CDOTA_BaseNPC_Hero;
        const list_wearables:CBaseEntity[] = [] 

        let model = hero.FirstMoveChild();
        while (model != null) {
            print("隐藏了饰品")
            if(model.GetClassname().includes("dota_item")){
                list_wearables.push(model);
            }
            model = model.NextMovePeer();
        }   

        list_wearables.forEach(elm=>{
            UTIL_RemoveImmediate(elm)
        })
    }


    export function ApproximateNormalFromOBB(unit: CBaseEntity, vec: Vector): Vector {
        const epsilon = 10; // 偏移量，越小越精确
        const base = CalcClosestPointOnEntityOBB(unit, vec);
    
        const offsets = [
            Vector(epsilon, 0, 0),
            Vector(-epsilon, 0, 0),
            Vector(0, epsilon, 0),
            Vector(0, -epsilon, 0),
            Vector(0, 0, epsilon),
            Vector(0, 0, -epsilon),
        ];
    
        let normalSum = Vector(0, 0, 0);
    
        for (const offset of offsets) {
            const samplePoint = vec.__add(offset);
            const nearPoint = CalcClosestPointOnEntityOBB(unit, samplePoint);
            const delta = nearPoint.__sub(base);
            normalSum = normalSum.__add(delta);
        }
    
        return normalSum.Normalized();
    }
}

import { BaseModifier, registerModifier } from "../utils/dota_ts_adapter";
import { reloadable } from "../utils/tstl-utils";
import { blackList, classBlackList } from "./black_list";
import { EntityFilter, Speciel } from "./white_list";


@registerModifier()
export class modifier_free extends BaseModifier{
    CheckState(): Partial<Record<ModifierState, boolean>> {
        return {
            [ModifierState.FEARED]:true,
            [ModifierState.STUNNED]:true,
        }
    }
}


export const botlist: Partial<Record<PlayerID, { is_bot: boolean; team: DotaTeam; PlayerID: PlayerID; hero: string; lane: string }>> = {}

export const RawPlayerIDlist: Partial<Record<PlayerID, "raw" | "fake">> = {}

export let last_hero: Record<string,CDOTA_BaseNPC_Hero> = {};


export function AddOneBot(team: DotaTeam, heroName: string, lane: string, difficulty: string = "unfair",fn?:Function) {
    GameRules.GetGameModeEntity().SetBotThinkingEnabled(true)

    const ls = ListenToGameEvent("npc_spawned", (event) => {
        const hero = EntIndexToHScript(event.entindex) as CDOTA_BaseNPC_Hero;
        if (heroName == hero.GetClassname() && hero.IsRealHero()) {
            last_hero[hero.GetClassname()] = hero;

            botlist[hero.GetPlayerID()] = {
                is_bot: true,
                team,
                PlayerID: hero.GetPlayerID(),
                hero: heroName,
                lane: lane,
            }

            PlayerResource.SetCustomTeamAssignment(hero.GetPlayerID() as PlayerID, team)
            fn?.(hero)

            print("添加了机器人", hero.GetPlayerID(), heroName, lane)
            StopListeningToGameEvent(ls)

        }
    }, null)


    Tutorial.AddBot(heroName, lane, difficulty, team == DotaTeam.BADGUYS ? false : true)





}
export function SnapshotExtensionTempalte() {


    EntitySnapshotExtensionManager.register({
        "onCapture": (ent, data) => {
            if (!ent.IsInstance(CDOTA_BaseNPC_Building)) return
            data["InvulnCount"] = ent.GetInvulnCount()
        },
        "onRestore": (ent, data) => {
            if (!ent.IsInstance(CDOTA_BaseNPC_Building)) return
            ent.SetInvulnCount(data["InvulnCount"])
            print("设置了建筑的无敌次数")
        }
    })
}

export interface SnapshotExtension {
    /** 快照时插入自定义数据 */
    onCapture?(entity: CBaseEntity, data: Partial<EntitySnapshotData>): void;

    /** 创建时给新实体赋值 */
    onRestore?(entity: CBaseEntity, data: Partial<EntitySnapshotData>): void;
}


export class EntitySnapshotExtensionManager {
    private static extensions: SnapshotExtension[] = [];

    static register(ext: SnapshotExtension) {
        this.extensions.push(ext);
    }

    static applyCapture(entity: CBaseEntity, data: Partial<EntitySnapshotData>) {
        for (const ext of this.extensions) {
            ext.onCapture?.(entity, data);
        }
    }

    static applyRestore(entity: CBaseEntity, data: Partial<EntitySnapshotData>) {
        for (const ext of this.extensions) {
            ext.onRestore?.(entity, data);
        }
    }
}

/**
 * 快照数据结构接口
 */
export interface ModifierSnapshotData {
    modifierName: string;
    casterUidPtr: UidPtr;
    selfUidPtr: UidPtr
    stackCount: number;
    remainingTime: number;
    abilityName?: string;
    extraState?: any;
    version: string; // 添加版本控制
}

export class ModifierSnapshot {
    data: ModifierSnapshotData;
    constructor(data: ModifierSnapshotData) {
        this.data = data;
    }

    static captureFromModifier(
        modifier: CDOTA_Buff,
    ): ModifierSnapshot | null {
        try {
            const caster = modifier.GetCaster();

            let casterUidPtr: UidPtr
            if (caster) {
                casterUidPtr = uidManager.oldEntityFindUidPtr(caster.entindex())
            } else {
                casterUidPtr = uidManager.oldEntityFindUidPtr(modifier.GetParent().entindex())
            }

            const parentUidPtr = uidManager.oldEntityFindUidPtr(modifier.GetParent().entindex())

            parentUidPtr.link.owned = modifier.GetParent().entindex()
            parentUidPtr.link.caster = caster.entindex()

            if (parentUidPtr == null) {
                print("当前的Parent没有uid")
                return
            }

            const ability = modifier.GetAbility?.();
            let curDuration = modifier.GetDuration()

            if (curDuration != -1) {
                curDuration = modifier.GetRemainingTime();
            }

            print("modifier.GetName()", modifier.GetName())

            return new ModifierSnapshot({
                modifierName: modifier.GetName(),
                selfUidPtr: parentUidPtr,
                casterUidPtr: casterUidPtr,
                stackCount: modifier.GetStackCount(),
                remainingTime: curDuration,
                abilityName: ability?.GetAbilityName(),
                extraState: this.captureModifierState(modifier),
                version: "1.1" // 版本号
            });
        } catch (e) {
            print(`[ModifierSnapshot] 捕获失败: ${e}`);
            return null;
        }
    }

    // 捕获modifier的自定义状态
    private static captureModifierState(modifier: CDOTA_Buff): any {
        const state: any = {};

        // 捕获常见属性
        for (const prop of ['stacks', 'charges', 'variant', 'level']) {
            if (modifier[prop] !== undefined) {
                state[prop] = modifier[prop];
            }
        }

        return state;
    }



    public restore(
    ): boolean {
        try {
            const d = this.data;

            let target: CDOTA_BaseNPC
            let caster: CDOTA_BaseNPC
            const targetEntityindex = this.data.selfUidPtr.newEntityindex
            const casterEntityindex = this.data.casterUidPtr.newEntityindex

            if (targetEntityindex) {
                target = EntIndexToHScript(targetEntityindex) as CDOTA_BaseNPC
            }

            if (casterEntityindex) {
                caster = EntIndexToHScript(casterEntityindex) as CDOTA_BaseNPC
            }



            if (target == null) {
                print(`[ModifierSnapshot] 找不到父级: ${d?.abilityName ?? ""}`,);
                return
            }


            // 如果目标已有同名modifier，先移除
            if (target.HasModifier(d.modifierName)) {
                target.RemoveModifierByName(d.modifierName);
            }   


            let abilitytable = {}
            // 找到 ability
            let abilityHandle: CDOTABaseAbility | undefined = undefined;
            if (d.abilityName) {
                abilityHandle = caster.FindAbilityByName(d.abilityName);
                if (!abilityHandle) {
                    print(`[ModifierSnapshot] 找不到来源技能: ${d.abilityName}`);
                    return
                }
            }

            if (abilityHandle) {
                const raw = Tool.getAbilityValues(caster.GetName(), d.abilityName)
                abilitytable = Tool.resolveAbilityValues(abilityHandle, raw, 1)
            }



            // 使用剩余时间直接作为 duration
            const duration = d.remainingTime;
            print("创造modifier", duration, "modifier的名字", d.modifierName)
            const mod = target.AddNewModifier(
                caster ?? target,
                abilityHandle ?? null,
                d.modifierName,
                Object.assign({ duration }, abilitytable)
            );

            // if (!mod) {
            //     print(`[ModifierSnapshot] 添加 modifier 失败: ${d.modifierName}`);
            //     return false;
            // }

            // mod.SetStackCount(d.stackCount);



            return true;
        } catch (e) {
            print(`[ModifierSnapshot] 恢复失败: ${e}`);
            return false;
        }
    }
}

// ============================
// 实体快照系统
// ============================

export interface EntitySnapshotData {
    lane: string
    map_name: string
    raw_name: string,
    unit_name: string
    PlayerID: PlayerID,
    logicId: string;
    entIndex: EntityIndex;
    health: number;
    mana: number;
    origin: [number, number, number];
    facing?: [number, number, number];
    isAlive: boolean;
    level?: number;
    str?: number;
    agi?: number;
    int?: number;
    model?: string;
    owned: EntityIndex
    baseModel?: string;
    modifiers: ModifierSnapshot[];
    attackTarget?: EntityIndex;
    version: string;
    facet: number
    newSpawnEntity: EntityIndex | undefined
    uid: string
    className: string
    team: DotaTeam
    AbilityPoint: number,
    is_bot: boolean
}


export class AbilityOrItemSnapshot {
    data: Partial<AbilityOrItemSnapShotData> = {}
    ptrUid: UidPtr = new UidPtr(DoUniqueString("uid"))

    static build() {
        return new this()
    }

    captureFromAbilityOrItem(entity: CDOTABaseAbility) {
        if (entity.IsItem()) {
            this.data.cooldown = entity.GetCooldownTimeRemaining()
            this.data.slot = entity.GetItemSlot()
            this.ptrUid.oldEntityindex = entity.GetOwner().entindex()
            this.data.is_item = entity.IsItem()
        } else {
            this.data.slot = entity.GetAbilityIndex()
            this.data.cooldown = entity.GetCooldownTimeRemaining()
            this.data.level = entity.GetLevel()
            this.data.isToggle = entity.IsToggle()
            this.data.name = entity.GetAbilityName()
            this.data.uid = DoUniqueString("uid")
            this.data.entity = entity.entindex()
        }
        this.data.isHidden = entity.IsHidden()
        this.data.level = entity.GetLevel()
        this.data.charges = entity.GetCurrentAbilityCharges()

        this.ptrUid.oldEntityindex = entity.GetOwner().entindex()
        this.ptrUid.link.owned = entity.GetOwner().entindex()

        const origin = entity.GetOrigin()
        this.data.origin = [origin.x, origin.y, origin.z]


        const forward = entity.GetForwardVector()
        this.data.facing = [forward.x, forward.y, forward.z]
        this.data.name = entity.GetAbilityName()
        this.data.owned = entity.GetOwner().entindex()
        uidManager.oldEntityRegister(entity.entindex(), this.ptrUid)
        return this
    }

    restore() {
        const name = this.data.name
        const is_item = this.data.is_item


        let owned: CDOTA_BaseNPC_Hero
        let playerID: PlayerID
        let player: CDOTAPlayerController
        const owned_ptr = uidManager.oldEntityFindUidPtr(this.ptrUid.oldEntityindex)

        if (owned_ptr && owned_ptr.newEntityindex) {
            owned = EntIndexToHScript(owned_ptr.newEntityindex) as CDOTA_BaseNPC_Hero
            if (owned == null) { return }
            playerID = owned.GetPlayerOwnerID?.()
            player = owned.GetPlayerOwner?.()
        }

        if (owned == null) {
            print("有装备来源没有找到",this.data.name)
            return
        }


        if (is_item) {
            DebugDrawText(owned.GetOrigin(),`${this.data.name}的拥有者`,true,50)
            const item = CreateItem(name, player, owned as CDOTA_BaseNPC_Hero)
            item.StartCooldown(this.data.cooldown)
            if (this.data.slot != -1) {
                if(owned.IsBaseNPC()){
                    owned.AddItem(item)
                    owned.SwapItems(this.data.slot, item.GetItemSlot())
                }
            } else {
                if (IsValidEntity(EntIndexToHScript(this.data.entity))) {
                    UTIL_Remove(EntIndexToHScript(this.data.entity))
                }
                CreateItemOnPositionForLaunch(Vector(this.data.origin[0], this.data.origin[1], this.data.origin[2]), item)
            }
            this.ptrUid.newEntityindex = item.entindex()
            uidManager.newEntityRegister(item.entindex(), this.ptrUid)
        } else {

            if (owned.IsBaseNPC() == false) return;

            let ability = owned.FindAbilityByName(name)
            if (!owned.HasAbility(name)) {
                ability = owned.AddAbility(name)
                if (owned.GetAbilityByIndex(this.data.slot)?.GetAbilityName()) {
                    owned.SwapAbilities(owned.GetAbilityByIndex(this.data.slot).GetAbilityName(), ability.GetName(), false, false)
                    ability.SetHidden(this.data.isHidden)
                }
            }
            print("当前值得", owned.GetAbilityByIndex(this.data.slot)?.GetAbilityName())

            ability.SetLevel(this.data.level)
            ability.StartCooldown(this.data.cooldown)

            if (this.data.isToggle) {
                ability.ToggleAbility()
                ability.ToggleAutoCast()
            }
            this.ptrUid.newEntityindex = ability.entindex()
            uidManager.newEntityRegister(ability.entindex(), this.ptrUid)
        }

    }
}

/**
 *  根据classname 来生成场景切片
 *  生成有3个步骤  
 *  1.是把所有的实体根据uid计入中心容器
 *  2.找到所有的副数据 比如技能 modifier 通过之前的实体uid 找到相关的数据
 *  3.通过索引自己的 snapshot的uid  来索引其他uid来生成
 */
@reloadable
export class EntitySnapshot {
    private data: Partial<EntitySnapshotData> = {};
    public uidPtr: UidPtr

    constructor() {
        this.data.uid = DoUniqueString("uid")
        this.uidPtr = new UidPtr(this.data.uid)
    }

    static build() {
        return new this()
    }

    /**记载已经加载的modifier */
    PrecapTureModifier(entity: CDOTA_BaseNPC) {
        const modifiers = entity.FindAllModifiers() as CDOTA_Buff[];
        const mods: ModifierSnapshot[] = []
        for (const mod of modifiers) {
            const snap = ModifierSnapshot.captureFromModifier(mod);
            if (snap) {
                mods.push(snap);
            }
        }
        this.data.modifiers = mods
    }
    /**
     * 最先加载的记录
     */
    Precapture(entity: CBaseEntity) {
        if (entity.IsBaseNPC()) {
            this.data.PlayerID = entity.GetPlayerOwnerID()
            this.data.health = entity.GetHealth();
            this.data.mana = entity.GetMana()
            this.data.unit_name = entity.GetUnitName();
            this.data.level = entity.GetLevel()
            this.data.attackTarget = entity.GetAttackTarget()?.entindex()
            if (entity.IsRealHero()) {
                this.data.int = entity.GetIntellect(false)
                this.data.str = entity.GetStrength()
                this.data.agi = entity.GetAgility()
                this.data.facet = entity.GetHeroFacetID()
                this.data.AbilityPoint = entity.GetAbilityPoints()
            }
            if (entity.GetPlayerOwnerID()) {
                this.data.lane = botlist[entity.GetPlayerOwnerID()]?.lane
                this.data.is_bot = botlist[entity.GetPlayerOwnerID()]?.is_bot
            }
        }
        if (entity.IsInstance(CDOTA_BaseNPC_Building)) {
            this.data.unit_name = entity.GetUnitName()
        }
        this.data.attackTarget
        this.data.className = entity.GetClassname()
        this.data.baseModel = entity.GetModelName()
        this.data.isAlive = entity.IsAlive()
        let { x, y, z } = entity.GetForwardVector();
        this.data.facing = [x, y, z]
        let origin = entity.GetAbsOrigin()
        this.data.origin = [origin.x, origin.y, origin.z]
        this.data.raw_name = entity.GetName()
        this.data.team = entity.GetTeam()
        this.data.entIndex = entity.entindex()
        this.data.model = entity.GetModelName()
        this.data.map_name = entity.GetName()
        uidManager.oldEntityRegister(entity.entindex(), this.uidPtr)
        EntitySnapshotExtensionManager.applyCapture(entity, this.data)
        return this
    }


    Postcapture() {
        let entityindex: EntityIndex = this.data.entIndex
        let entity: CDOTA_BaseNPC

        if (entityindex) {
            entity = EntIndexToHScript(entityindex) as CDOTA_BaseNPC
        }

        this.PrecapTureModifier(entity)
    }

    public PostModifier() {
        this.data.modifiers.forEach(snap => {
            print("开始重建一个modifier")
            snap.restore()
        })
    }

    public SetAttribute(npc: CDOTA_BaseNPC) {
        GameRules.GetGameModeEntity().SetThink(()=>{
            if (npc.IsRealHero()) {
                npc.SetBaseAgility(this.data.agi)
                npc.SetBaseStrength(this.data.str)
                npc.SetBaseIntellect(this.data.int)
                npc.SetAbilityPoints(this.data.AbilityPoint)
                for (let i = 0; i < this.data.level; i++) {
                    npc.HeroLevelUp(false)
                }
            }
    
            npc.SetAbsOrigin(Vector(this.data.origin[0], this.data.origin[1], this.data.origin[2]))
            print("给机器人",npc.GetPlayerOwnerID(),"设置了坐标",npc.GetOrigin())
            npc.SetForwardVector(Vector(this.data.facing[0], this.data.facing[1], this.data.facing[2]))
            npc.SetHealth(this.data.health)
            npc.SetMana(this.data.mana)
            return null
        },undefined,DoUniqueString("timer"),undefined)
    }

    public BotSpawn(){
        return new Promise((res,rej)=>{
            if (this.data.is_bot) {
                print("当前新加AddOneBot")
    
                AddOneBot(this.data.team, this.data.className, this.data.lane,undefined,()=>{
                    const hero = last_hero[this.data.className]
                    hero.SetPlayerID(this.data.PlayerID)
                    hero.SetOwner(PlayerResource.GetPlayer(this.data.PlayerID))
                    hero.SetControllableByPlayer(this.data.PlayerID, true)
                    this.SetAttribute(hero)
                    this.data.newSpawnEntity = hero.entindex()
                    this.uidPtr.newEntityindex = hero.entindex()
                    uidManager.newEntityRegister(hero.entindex(), this.uidPtr)
                    EntitySnapshotExtensionManager.applyRestore(hero, this.data)
                    hero.AddNewModifier(hero,null,modifier_free.name,{duration:-1})
                    res(this.data.PlayerID)
                    return null
                })           
            }else{
                res(null)
            }
        })

    }

    public buildSpawn(){

    
            if (this.data.className.includes("npc_dota_creep")) {
                const newEntity = CreateUnitByName(this.data.unit_name, Vector(this.data.origin[0], this.data.origin[1], this.data.origin[2]), false, null, null, this.data.team)
                let path: CBaseEntity
                if (newEntity.GetTeam() == DotaTeam.BADGUYS) {
                    path = Entities.FindByNameNearest("*pathcorner_badguys*", newEntity.GetOrigin(), 9999)
                }
                if (newEntity.GetTeam() == DotaTeam.GOODGUYS) {
                    path = Entities.FindByNameNearest("*pathcorner_goodguys*", newEntity.GetOrigin(), 9999)
                }
                newEntity.SetInitialGoalEntity(path)
                this.SetAttribute(newEntity)
                this.uidPtr.newEntityindex = newEntity.entindex()
                uidManager.newEntityRegister(newEntity.entindex(), this.uidPtr)
                EntitySnapshotExtensionManager.applyRestore(newEntity, this.data)
                newEntity.AddNewModifier(newEntity,null,modifier_free.name,{duration:-1})
                return
            }
    
            if (this.data.className == "npc_dota_tower") {
                let newEntity: CDOTA_BaseNPC;
    
                newEntity = CreateUnitFromTable({
                    targetname: this.data.raw_name,
                    origin: `${this.data.origin[0]} ${this.data.origin[1]} ${this.data.origin[2]}`,
                    rendercolor: "188 199 160 255",
                    teamnumber: this.data.team,
                    MapUnitName: this.data.unit_name
                }, Vector(this.data.origin[0], this.data.origin[1], this.data.origin[2]))
    
                const data = builds.get()
    
    
                data[this.data.raw_name] = newEntity as CDOTA_BaseNPC_Building
                newEntity.SetOrigin(Vector(this.data.origin[0], this.data.origin[1], this.data.origin[2]))
                newEntity.SetHealth(this.data.health)
                newEntity.SetMana(this.data.mana)
                newEntity.SetForwardVector(Vector(this.data.facing[0], this.data.facing[1], this.data.facing[2]))
                newEntity.RemoveAllModifiers(2,false,false,false)
                this.uidPtr.newEntityindex = newEntity.entindex()
                uidManager.newEntityRegister(newEntity.entindex(), this.uidPtr)
                EntitySnapshotExtensionManager.applyRestore(newEntity, this.data)
                return
            }
    
            if (this.data.className.includes("npc_dota_barracks")) {
                let newEntity: CDOTA_BaseNPC;
                newEntity = CreateUnitFromTable({
                    targetname: this.data.raw_name,
                    origin: `${this.data.origin[0]} ${this.data.origin[1]} ${this.data.origin[2]}`,
                    rendercolor: "188 199 160 255",
                    teamnumber: this.data.team,
                    MapUnitName: this.data.unit_name
                }, Vector(this.data.origin[0], this.data.origin[1], this.data.origin[2]))
    
                const data = builds.get()
                if (data[this.data.raw_name] == null) {
                    print(this.data.raw_name)
                    print("没有没有")
                }
                data[this.data.raw_name] = newEntity as CDOTA_BaseNPC_Building
    
                newEntity.SetOrigin(Vector(this.data.origin[0], this.data.origin[1], this.data.origin[2]))
                newEntity.SetHealth(this.data.health)
                newEntity.SetMana(this.data.mana)
                newEntity.SetForwardVector(Vector(this.data.facing[0], this.data.facing[1], this.data.facing[2]))
                newEntity.RemoveAllModifiers(2,false,false,false)
                this.uidPtr.newEntityindex = newEntity.entindex()
                uidManager.newEntityRegister(newEntity.entindex(), this.uidPtr)
                EntitySnapshotExtensionManager.applyRestore(newEntity, this.data)
                return
            }
    }

    public HeroSpawn() {
        return new Promise((res,rej)=>{
            if (this.data.className.includes("npc_dota_hero")) {
                const playerID = this.data.PlayerID;
                const unitname = this.data.raw_name
                if (!this.data.is_bot) {
                    const player = PlayerResource.GetPlayer(this.data.PlayerID)
                    print("是否成功",DebugCreateHeroWithVariant(
                        player,
                        unitname,
                        this.data.facet,
                        player.GetTeam(),
                        false,
                        /**@noSelf */
                        (hero: CDOTA_BaseNPC_Hero) => {
                            const playerid = hero.GetPlayerID()
                            hero.SetPlayerID(this.data.PlayerID)
                            hero.SetOwner(PlayerResource.GetPlayer(this.data.PlayerID))
                            hero.SetControllableByPlayer(this.data.PlayerID, true)
                            player.SetAssignedHeroEntity(hero)
                            this.SetAttribute(hero)
                            this.data.newSpawnEntity = hero.entindex()
                            this.uidPtr.newEntityindex = hero.entindex()
                            uidManager.newEntityRegister(hero.entindex(), this.uidPtr)
                            EntitySnapshotExtensionManager.applyRestore(hero, this.data)
                            res(hero.GetPlayerID())
                            hero.AddNewModifier(hero,null,modifier_free.name,{duration:-1})
                            return null
                        }
                    ))
                }    
            }else{
                res(null)
            }
            
        })
    }
            
    public getData(): Partial<EntitySnapshotData> {
        return this.data;
    }
}

// ============================
// 全局快照系统
// ============================

export interface GlobalSnapshotData {
    timestamp: number;
    gameTime: number;
    gameState: number;
    entities: EntitySnapshotData[];
    version: string;
}

export class GameSnapshot {
    private data: GlobalSnapshotData;
    private entitySnapshots: EntitySnapshot[] = [];

    constructor(data: GlobalSnapshotData) {
        this.data = data;
    }
}

// 技能和物品快照
interface AbilitySnapshotData {
    name: string;
    level: number;
    cooldown: number;
    isHidden: boolean;
    isActivated: boolean;
    isToggle: boolean;
    toggleState: boolean;
    is_item: boolean
    uid: uid
    entity: EntityIndex
    owned: EntityIndex
    slot: number
    origin: [number, number, number];
    facing?: [number, number, number];
}

interface ItemSnapshotData {
    name: string;
    cooldown: number;
    charges: number;
    is_item: boolean;
    uid: uid
    entity: EntityIndex
    owned: EntityIndex
    slot: number
    origin: [number, number, number];
    facing?: [number, number, number];
}

type AbilityOrItemSnapShotData = AbilitySnapshotData & ItemSnapshotData



type uid = string;
type version = string;

const oldUidToSnapshot: Map<uid, EntitySnapshot> = new Map();
const oldSnapshotToUid: Map<EntitySnapshot, uid> = new Map();




class UidPtr {


    private _oldEntityindex: EntityIndex;
    public get oldEntityindex(): EntityIndex {
        return this._oldEntityindex;
    }
    public set oldEntityindex(v: EntityIndex) {
        this._oldEntityindex = v;
    }


    private _newEntityindex: EntityIndex;
    public get newEntityindex(): EntityIndex {
        return this._newEntityindex;
    }
    public set newEntityindex(v: EntityIndex) {
        this._newEntityindex = v;
    }

    public link: Partial<{
        caster: EntityIndex | undefined,
        owned: EntityIndex | undefined
    }> = {}

    uid: uid

    constructor(uid: uid) {
        this.uid = uid;
    }

    setCasterLink(EntityIndex: EntityIndex) {
        this.link.caster = EntityIndex
    }

    setOwnedLink(EntityIndex: EntityIndex) {
        this.link.owned = EntityIndex
    }

}

class uidManager {
    static PtrToUid: Map<EntityIndex, UidPtr> = new Map()

    static oldEntityFindUidPtr(entindex: EntityIndex) {
        const ptr = this.PtrToUid.get(entindex)
        if (ptr == null) {
            return
        }
        return ptr
    }

    static newEntityFindUidPtr(entindex: EntityIndex) {
        const ptr = this.PtrToUid.get(entindex)
        if (ptr == null) {
            return
        }
        return ptr
    }

    static oldEntityRegister(entindex: EntityIndex, uidPtr: UidPtr) {
        const ptr = this.PtrToUid.set(entindex, uidPtr)
    }

    static newEntityRegister(entindex: EntityIndex, uidPtr: UidPtr) {
        const ptr = this.PtrToUid.set(entindex, uidPtr)
    }
}

const BotSnapContainer:Map<version,EntitySnapshot[]> = new Map()
const heroPlayerSnapContainer:Map<version,EntitySnapshot[]> = new Map()
const EntitySnapContainer: Map<version, EntitySnapshot[]> = new Map()
const AbilityOrItemSnapContainer: Map<version, AbilityOrItemSnapshot[]> = new Map()


export function RegisterLogicId(uid: uid, EntitySnapshot: EntitySnapshot) {
    try {
        oldUidToSnapshot.set(uid, EntitySnapshot)
        oldSnapshotToUid.set(EntitySnapshot, uid)
    } catch (e) {
        print(`[generateLogicId] 生成失败: ${e}`);
    }
}



// ============================
// 使用示例
// ============================

// 创建快照
function saveGameState() {
    // const snapshot = GameSnapshot.capture(generateLogicId);
    // if (snapshot) {
    //     snapshot.saveToFile("save1.json");
    //     print("游戏状态已保存");
    // }
}


const version = "1.0"


class builds {
    static buildings: Record<string, CDOTA_BaseNPC_Building | undefined> = {};

    static get() {
        return this.buildings
    }

    static buildingNamesRadiant = [
        "dota_goodguys_fort",
        "dota_goodguys_tower1_bot",
        "dota_goodguys_tower2_bot",
        "dota_goodguys_tower3_bot",
        "dota_goodguys_tower1_mid",
        "dota_goodguys_tower2_mid",
        "dota_goodguys_tower3_mid",
        "dota_goodguys_tower1_top",
        "dota_goodguys_tower2_top",
        "dota_goodguys_tower3_top",
        "dota_goodguys_tower4_top",
        "dota_goodguys_tower4_bot",
        "good_rax_melee_bot",
        "good_rax_range_bot",
        "good_rax_melee_mid",
        "good_rax_range_mid",
        "good_rax_melee_top",
        "good_rax_range_top",
    ];

    static buildingNamesDire = [
        "dota_badguys_fort",
        "dota_badguys_tower1_bot",
        "dota_badguys_tower2_bot",
        "dota_badguys_tower3_bot",
        "dota_badguys_tower1_mid",
        "dota_badguys_tower2_mid",
        "dota_badguys_tower3_mid",
        "dota_badguys_tower1_top",
        "dota_badguys_tower2_top",
        "dota_badguys_tower3_top",
        "dota_badguys_tower4_top",
        "dota_badguys_tower4_bot",
        "bad_rax_melee_bot",
        "bad_rax_range_bot",
        "bad_rax_melee_mid",
        "bad_rax_range_mid",
        "bad_rax_melee_top",
        "bad_rax_range_top",
    ];
    static update() {
        const buildings: Record<string, CDOTA_BaseNPC_Building | undefined> = {};

        // Radiant towers
        buildings["dota_goodguys_tower1_bot"] = Entities.FindByName(undefined, "dota_goodguys_tower1_bot") as CDOTA_BaseNPC_Building;
        buildings["dota_goodguys_tower2_bot"] = Entities.FindByName(undefined, "dota_goodguys_tower2_bot") as CDOTA_BaseNPC_Building;
        buildings["dota_goodguys_tower3_bot"] = Entities.FindByName(undefined, "dota_goodguys_tower3_bot") as CDOTA_BaseNPC_Building;

        buildings["dota_goodguys_tower1_mid"] = Entities.FindByName(undefined, "dota_goodguys_tower1_mid") as CDOTA_BaseNPC_Building;
        buildings["dota_goodguys_tower2_mid"] = Entities.FindByName(undefined, "dota_goodguys_tower2_mid") as CDOTA_BaseNPC_Building;
        buildings["dota_goodguys_tower3_mid"] = Entities.FindByName(undefined, "dota_goodguys_tower3_mid") as CDOTA_BaseNPC_Building;

        buildings["dota_goodguys_tower1_top"] = Entities.FindByName(undefined, "dota_goodguys_tower1_top") as CDOTA_BaseNPC_Building;
        buildings["dota_goodguys_tower2_top"] = Entities.FindByName(undefined, "dota_goodguys_tower2_top") as CDOTA_BaseNPC_Building;
        buildings["dota_goodguys_tower3_top"] = Entities.FindByName(undefined, "dota_goodguys_tower3_top") as CDOTA_BaseNPC_Building;

        buildings["dota_goodguys_tower4_top"] = Entities.FindByName(undefined, "dota_goodguys_tower4_top") as CDOTA_BaseNPC_Building;
        buildings["dota_goodguys_tower4_bot"] = Entities.FindByName(undefined, "dota_goodguys_tower4_bot") as CDOTA_BaseNPC_Building;

        // Radiant barracks
        buildings["good_rax_melee_bot"] = Entities.FindByName(undefined, "good_rax_melee_bot") as CDOTA_BaseNPC_Building;
        buildings["good_rax_range_bot"] = Entities.FindByName(undefined, "good_rax_range_bot") as CDOTA_BaseNPC_Building;
        buildings["good_rax_melee_mid"] = Entities.FindByName(undefined, "good_rax_melee_mid") as CDOTA_BaseNPC_Building;
        buildings["good_rax_range_mid"] = Entities.FindByName(undefined, "good_rax_range_mid") as CDOTA_BaseNPC_Building;
        buildings["good_rax_melee_top"] = Entities.FindByName(undefined, "good_rax_melee_top") as CDOTA_BaseNPC_Building;
        buildings["good_rax_range_top"] = Entities.FindByName(undefined, "good_rax_range_top") as CDOTA_BaseNPC_Building;

        buildings["ent_dota_fountain_good"] = Entities.FindByName(undefined, "ent_dota_fountain_good") as CDOTA_BaseNPC_Building;

        // Dire towers
        buildings["dota_badguys_tower1_bot"] = Entities.FindByName(undefined, "dota_badguys_tower1_bot") as CDOTA_BaseNPC_Building;
        buildings["dota_badguys_tower2_bot"] = Entities.FindByName(undefined, "dota_badguys_tower2_bot") as CDOTA_BaseNPC_Building;
        buildings["dota_badguys_tower3_bot"] = Entities.FindByName(undefined, "dota_badguys_tower3_bot") as CDOTA_BaseNPC_Building;

        buildings["dota_badguys_tower1_mid"] = Entities.FindByName(undefined, "dota_badguys_tower1_mid") as CDOTA_BaseNPC_Building;
        buildings["dota_badguys_tower2_mid"] = Entities.FindByName(undefined, "dota_badguys_tower2_mid") as CDOTA_BaseNPC_Building;
        buildings["dota_badguys_tower3_mid"] = Entities.FindByName(undefined, "dota_badguys_tower3_mid") as CDOTA_BaseNPC_Building;

        buildings["dota_badguys_tower1_top"] = Entities.FindByName(undefined, "dota_badguys_tower1_top") as CDOTA_BaseNPC_Building;
        buildings["dota_badguys_tower2_top"] = Entities.FindByName(undefined, "dota_badguys_tower2_top") as CDOTA_BaseNPC_Building;
        buildings["dota_badguys_tower3_top"] = Entities.FindByName(undefined, "dota_badguys_tower3_top") as CDOTA_BaseNPC_Building;

        buildings["dota_badguys_tower4_top"] = Entities.FindByName(undefined, "dota_badguys_tower4_top") as CDOTA_BaseNPC_Building;
        buildings["dota_badguys_tower4_bot"] = Entities.FindByName(undefined, "dota_badguys_tower4_bot") as CDOTA_BaseNPC_Building;

        // Dire barracks
        buildings["bad_rax_melee_bot"] = Entities.FindByName(undefined, "bad_rax_melee_bot") as CDOTA_BaseNPC_Building;
        buildings["bad_rax_range_bot"] = Entities.FindByName(undefined, "bad_rax_range_bot") as CDOTA_BaseNPC_Building;
        buildings["bad_rax_melee_mid"] = Entities.FindByName(undefined, "bad_rax_melee_mid") as CDOTA_BaseNPC_Building;
        buildings["bad_rax_range_mid"] = Entities.FindByName(undefined, "bad_rax_range_mid") as CDOTA_BaseNPC_Building;
        buildings["bad_rax_melee_top"] = Entities.FindByName(undefined, "bad_rax_melee_top") as CDOTA_BaseNPC_Building;
        buildings["bad_rax_range_top"] = Entities.FindByName(undefined, "bad_rax_range_top") as CDOTA_BaseNPC_Building;

        buildings["dota_goodguys_fort"] = Entities.FindByName(undefined, "dota_goodguys_fort") as CDOTA_BaseNPC_Building;
        buildings["dota_badguys_fort"] = Entities.FindByName(undefined, "dota_badguys_fort") as CDOTA_BaseNPC_Building;

        print("找到了基地dota_badguys_fort", buildings["dota_badguys_fort"])
        print("找到了基地dota_goodguys_fort", buildings["dota_goodguys_fort"])

        this.buildings = buildings;
    }
}




const GoodConnet: Record<string, { fn: (me: CDOTA_BaseNPC_Building) => void }> = {
    "dota_goodguys_tower1_bot": {
        fn: (me) => {
            const target = Entities.FindByName(me, "dota_goodguys_tower2_bot") as CDOTA_BaseNPC_Building;
            if (target) {
                me.RedirectOutput("OnTowerKilled", "OnTowerKilled", me);
                me["OnTowerKilled"] = () => {
                    target.SetInvulnCount(0);
                };
            }
        }
    },
    "dota_goodguys_tower2_bot": {
        fn: (me) => {


            me.RedirectOutput("OnTowerKilled", "OnTowerKilled", me);
            me["OnTowerKilled"] = () => {
                const data = builds.get()
                const buildies = builds.buildingNamesRadiant.map(elm => {
                    return data[elm]
                })
                buildies.forEach(e => {
                    if (IsValidEntity(e)) {
                        e.SetInvulnCount(0)
                    }
                })
            };

        }
    },
    "dota_goodguys_tower1_top": {
        fn: (me) => {
            const target = Entities.FindByName(me, "dota_goodguys_tower2_top") as CDOTA_BaseNPC_Building;
            if (target) {
                me.RedirectOutput("OnTowerKilled", "OnTowerKilled", me);
                me["OnTowerKilled"] = () => {
                    target.SetInvulnCount(0);
                };
            }
        }
    },
    "dota_goodguys_tower_top": {
        fn: (me) => {
            // const target = Entities.FindByName(me, "dota_badguys_tower3_mid") as CDOTA_BaseNPC_Building;
            // const p1 = Entities.FindByName(me, "good_rax_melee_mid") as CDOTA_BaseNPC_Building;
            // const p2 = Entities.FindByName(me, "bad_rax_melee_mid") as CDOTA_BaseNPC_Building;
            // const p3 = Entities.FindByName(me, "dota_badguys_tower3_mid") as CDOTA_BaseNPC_Building;
            // const p4 = Entities.FindByName(me, "dota_goodguys_tower4_top") as CDOTA_BaseNPC_Building;
            // const p5 = Entities.FindByName(me, "npc_dota_goodguys_fort") as CDOTA_BaseNPC_Building; 
            // const p6 = Entities.FindByName(me,"npc_dota_badguys_melee_rax_top") as CDOTA_BaseNPC_Building; 
            // const p7 = Entities.FindByName(me,"npc_dota_badguys_range_rax_top") as CDOTA_BaseNPC_Building; 
            // const p8 = Entities.FindByName(me,"npc_dota_badguys_tower3_top") as CDOTA_BaseNPC_Building; 

            me.RedirectOutput("OnTowerKilled", "OnTowerKilled", me);
            me["OnTowerKilled"] = () => {
                const data = builds.get()
                const buildies = builds.buildingNamesRadiant.map(elm => {
                    return data[elm]
                })
                buildies.forEach(e => {
                    if (IsValidEntity(e)) {
                        e.SetInvulnCount(0)
                    }
                })
            };

        }
    },
    "dota_goodguys_tower1_mid": {
        fn: (me) => {
            const target = Entities.FindByName(me, "dota_goodguys_tower2_mid") as CDOTA_BaseNPC_Building;
            if (target) {
                me.RedirectOutput("OnTowerKilled", "OnTowerKilled", me);
                me["OnTowerKilled"] = () => {
                    target.SetInvulnCount(0);
                };
            }
        }
    },
    "dota_goodguys_tower2_mid": {
        fn: (me) => {
            // const target = Entities.FindByName(me, "dota_badguys_tower3_mid") as CDOTA_BaseNPC_Building;
            // const p1 = Entities.FindByName(me, "good_rax_melee_mid") as CDOTA_BaseNPC_Building;
            // const p2 = Entities.FindByName(me, "bad_rax_melee_mid") as CDOTA_BaseNPC_Building;
            // const p3 = Entities.FindByName(me, "dota_badguys_tower3_mid") as CDOTA_BaseNPC_Building;
            // const p4 = Entities.FindByName(me, "dota_goodguys_tower4_top") as CDOTA_BaseNPC_Building;
            // const p5 = Entities.FindByName(me, "npc_dota_goodguys_fort") as CDOTA_BaseNPC_Building; 
            // const p6 = Entities.FindByName(me,"npc_dota_badguys_melee_rax_top") as CDOTA_BaseNPC_Building; 
            // const p7 = Entities.FindByName(me,"npc_dota_badguys_range_rax_top") as CDOTA_BaseNPC_Building; 
            // const p8 = Entities.FindByName(me,"npc_dota_badguys_tower3_top") as CDOTA_BaseNPC_Building; 

            me.RedirectOutput("OnTowerKilled", "OnTowerKilled", me);
            me["OnTowerKilled"] = () => {
                const data = builds.get()
                const buildies = builds.buildingNamesRadiant.map(elm => {
                    return data[elm]
                })
                buildies.forEach(e => {
                    if (IsValidEntity(e)) {
                        e.SetInvulnCount(0)
                    }
                })
            };
        }
    },
};



const BadConnect: Record<string, { fn: (me: CDOTA_BaseNPC_Building) => void }> = {
    "dota_badguys_tower1_bot": {
        fn: (me) => {
            me.RedirectOutput("OnTowerKilled", "OnTowerKilled", me);
            me["OnTowerKilled"] = () => {
                const target = Entities.FindByName(me, "dota_badguys_tower2_bot") as CDOTA_BaseNPC_Building;
                if (target) {
                    target.SetInvulnCount(0);
                }
            };
        }
    },
    "dota_badguys_tower2_bot": {
        fn: (me) => {
            // const target = Entities.FindByName(me, "dota_badguys_tower3_mid") as CDOTA_BaseNPC_Building;
            // const p1 = Entities.FindByName(me, "good_rax_melee_mid") as CDOTA_BaseNPC_Building;
            // const p2 = Entities.FindByName(me, "bad_rax_melee_mid") as CDOTA_BaseNPC_Building;
            // const p3 = Entities.FindByName(me, "dota_badguys_tower3_mid") as CDOTA_BaseNPC_Building;
            // const p4 = Entities.FindByName(me, "dota_goodguys_tower4_top") as CDOTA_BaseNPC_Building;
            // const p5 = Entities.FindByName(me, "npc_dota_goodguys_fort") as CDOTA_BaseNPC_Building; 
            // const p6 = Entities.FindByName(me,"npc_dota_badguys_melee_rax_top") as CDOTA_BaseNPC_Building; 
            // const p7 = Entities.FindByName(me,"npc_dota_badguys_range_rax_top") as CDOTA_BaseNPC_Building; 
            // const p8 = Entities.FindByName(me,"npc_dota_badguys_tower3_top") as CDOTA_BaseNPC_Building; 

            me.RedirectOutput("OnTowerKilled", "OnTowerKilled", me);
            me["OnTowerKilled"] = () => {
                const data = builds.get()
                const buildies = builds.buildingNamesDire.map(elm => {
                    return data[elm]
                })
                buildies.forEach(e => {
                    if (IsValidEntity(e)) {
                        e.SetInvulnCount(0)
                    }
                })
            };

        }
    },
    "dota_badguys_tower1_mid": {
        fn: (me) => {
            me.RedirectOutput("OnTowerKilled", "OnTowerKilled", me);
            me["OnTowerKilled"] = () => {
                const target = Entities.FindByName(null, "dota_badguys_tower2_mid") as CDOTA_BaseNPC_Building;
                if (target) {
                    target.SetInvulnCount(0);
                }
            };
        }
    },
    "dota_badguys_tower2_mid": {
        fn: (me) => {
            // const target = Entities.FindByName(me, "dota_badguys_tower3_mid") as CDOTA_BaseNPC_Building;
            // const p1 = Entities.FindByName(me, "good_rax_melee_mid") as CDOTA_BaseNPC_Building;
            // const p2 = Entities.FindByName(me, "bad_rax_melee_mid") as CDOTA_BaseNPC_Building;
            // const p3 = Entities.FindByName(me, "dota_badguys_tower3_mid") as CDOTA_BaseNPC_Building;
            // const p4 = Entities.FindByName(me, "dota_goodguys_tower4_top") as CDOTA_BaseNPC_Building;
            // const p5 = Entities.FindByName(me, "npc_dota_goodguys_fort") as CDOTA_BaseNPC_Building; 
            // const p6 = Entities.FindByName(me,"npc_dota_badguys_melee_rax_top") as CDOTA_BaseNPC_Building; 
            // const p7 = Entities.FindByName(me,"npc_dota_badguys_range_rax_top") as CDOTA_BaseNPC_Building; 
            // const p8 = Entities.FindByName(me,"npc_dota_badguys_tower3_top") as CDOTA_BaseNPC_Building; 


            me.RedirectOutput("OnTowerKilled", "OnTowerKilled", me);
            me["OnTowerKilled"] = () => {
                const data = builds.get()
                const buildies = builds.buildingNamesDire.map(elm => {
                    return data[elm]
                })
                buildies.forEach(e => {
                    if (IsValidEntity(e)) {
                        e.SetInvulnCount(0)
                    }
                })
            };

        },
    },
    "dota_badguys_tower1_top": {
        fn: (me) => {
            me.RedirectOutput("OnTowerKilled", "OnTowerKilled", me);
            me["OnTowerKilled"] = () => {
                const target = Entities.FindByName(me, "dota_badguys_tower2_top") as CDOTA_BaseNPC_Building;
                if (target) {
                    target.SetInvulnCount(0);
                }
            };
        }
    },
    "dota_badguys_tower2_top": {
        fn: (me) => {
            // const target = Entities.FindByName(me, "dota_badguys_tower3_mid") as CDOTA_BaseNPC_Building;
            // const p1 = Entities.FindByName(me, "good_rax_melee_mid") as CDOTA_BaseNPC_Building;
            // const p2 = Entities.FindByName(me, "bad_rax_melee_mid") as CDOTA_BaseNPC_Building;
            // const p3 = Entities.FindByName(me, "dota_badguys_tower3_mid") as CDOTA_BaseNPC_Building;
            // const p4 = Entities.FindByName(me, "dota_goodguys_tower4_top") as CDOTA_BaseNPC_Building;
            // const p5 = Entities.FindByName(me, "npc_dota_goodguys_fort") as CDOTA_BaseNPC_Building; 
            // const p6 = Entities.FindByName(me,"npc_dota_badguys_melee_rax_top") as CDOTA_BaseNPC_Building; 
            // const p7 = Entities.FindByName(me,"npc_dota_badguys_range_rax_top") as CDOTA_BaseNPC_Building; 
            // const p8 = Entities.FindByName(me,"npc_dota_badguys_tower3_top") as CDOTA_BaseNPC_Building; 


            me.RedirectOutput("OnTowerKilled", "OnTowerKilled", me);
            me["OnTowerKilled"] = () => {
                const data = builds.get()

                const buildies = builds.buildingNamesDire.map(elm => {
                    print("当前链接名字")
                    print(elm)
                    return data[elm]
                })

                buildies.forEach(e => {
                    if (IsValidEntity(e)) {
                        e.SetInvulnCount(0)
                    }
                })
            };

        },
    },
};

export class GlobalConfigSave {
    static reloadCallFunction: (() => Function)[] = []
    static reloadCallFunctionResolve: Function[] = []

    static capStore(fn: (() => Function)) {
        this.reloadCallFunction.push(fn)
        this.reloadCallFunctionResolve = this.reloadCallFunction.map(fn => fn())
    }

    static Reload() {

        this.reloadCallFunction.forEach(fn => fn())
    }
}

export function SaveGameState() {
    const entities = Entities.FindAllByClassname("*")
        .filter(EntityFilter);
    
    SnapshotExtensionTempalte()

    EntitySnapContainer.clear()
    AbilityOrItemSnapContainer.clear()
    heroPlayerSnapContainer.clear()
    BotSnapContainer.clear()
    EntitySnapContainer.set(version, [])
    AbilityOrItemSnapContainer.set(version, [])
    heroPlayerSnapContainer.set(version,[])
    BotSnapContainer.set(version,[])

    GlobalConfigSave.capStore(() => {
        const BADGUYS = PlayerResource.GetPlayerCountForTeam(DotaTeam.BADGUYS)
        const GOODGUYS = PlayerResource.GetPlayerCountForTeam(DotaTeam.GOODGUYS)
        return () => {
            print("将夜宴最大队伍人数恢复到", BADGUYS)
            print("将天辉最大队伍人数恢复到", GOODGUYS)
            GameRules.SetCustomGameTeamMaxPlayers(DotaTeam.BADGUYS, BADGUYS)
            GameRules.SetCustomGameTeamMaxPlayers(DotaTeam.GOODGUYS, GOODGUYS)
        }
    })

    const container_ptr = EntitySnapContainer.get(version)
    const abilityOrItem_ptr = AbilityOrItemSnapContainer.get(version)
    const heroConatiner_ptr = heroPlayerSnapContainer.get(version)
    const bot_ptr = BotSnapContainer.get(version)


    entities
        .forEach(ent => {
            if (ent.IsInstance(CDOTA_Item) || ent.IsInstance(CDOTABaseAbility)) {
                if (ent.IsInstance(CDOTABaseAbility)) {
                    if (Speciel.has(ent.GetAbilityName())) {
                        return
                    }
                }
                const snap = AbilityOrItemSnapshot.build().captureFromAbilityOrItem(ent)
                abilityOrItem_ptr.push(snap)
            }
            if (ent.IsBaseNPC()) {
                const snap = EntitySnapshot.build().Precapture(ent)
                if(snap.getData().PlayerID != -1 && botlist[snap.getData().PlayerID] == null && snap.getData().is_bot != true){
                    heroConatiner_ptr.push(snap)
                    return
                }
                if(snap.getData().is_bot){
                    bot_ptr.push(snap)
                    return
                }
                container_ptr.push(snap)
            }


        })

    container_ptr.forEach(snap => {

        snap.Postcapture()
    })


    print(`version:${version} 总共采样${entities.length}个实体 本次保存${EntitySnapContainer.get(version).length}个entity`)

    FireGameEvent("dota_hud_error_message",
        {
            "splitscreenplayer": 0,
            "reason": 80,
            "message": `version:${version} 总共采样${entities.length}个实体 本次保存${EntitySnapContainer.get(version).length}个entity`,
        } as never)



}


const overSign:{state:"none"|"hero"|"bot"|"ability_r"|"modifier_r"|"build_link"|"reset"} = {"state":"none"}

export function LoadSnap() {
    overSign.state = "none"

    
    GameRules.SetCustomGameTeamMaxPlayers(DotaTeam.BADGUYS, 12)
    GameRules.SetCustomGameTeamMaxPlayers(DotaTeam.GOODGUYS, 24)

    Entities.FindAllByClassname("*")
    .filter(EntityFilter)
    .forEach(entity => {
        if (IsValidEntity(entity)) {
            print(entity.GetName())
            UTIL_RemoveImmediate(entity)
        }
    })

    
    for(let i = -1 ; i < 30 ; i++){
        const player = PlayerResource.GetPlayer(i as PlayerID)
        GameRules.ResetPlayer(i)
        DisconnectClient(i as PlayerID,true)
        GameRules.RemoveFakeClient(i as PlayerID)
    }

        EntitySnapContainer.get(version).forEach(snap => {
            snap.buildSpawn()
        })

    GameRules.GetGameModeEntity().SetThink(() => {
        heroPlayerSnapContainer.get(version).forEach(snap=>{
            snap.HeroSpawn().then((elm:PlayerID)=>{
                if(PlayerResource.GetPlayer(elm)){
                    RawPlayerIDlist[elm] = "raw"
                }
            })
        })
        return null
    }, undefined, DoUniqueString("time"), 0.3)


    GameRules.GetGameModeEntity().SetThink(() => {
        print(Object.values(RawPlayerIDlist).length,heroPlayerSnapContainer.get(version).length)
        if(Object.values(RawPlayerIDlist).length == heroPlayerSnapContainer.get(version).length){
            overSign.state = "bot"
        }else{
            return 0.1
        }



        return null
    }, undefined, DoUniqueString("time"), 0.1)
    
    let bot_over = false
    GameRules.GetGameModeEntity().SetThink(() => {
        if(overSign.state != "bot"){
            return 0.1
        }

        Promise.all(BotSnapContainer.get(version).map(snap=>{
            snap.BotSpawn()
        })).then(elm=>{
            bot_over = true
        })

        if(bot_over == true){
            overSign.state = "ability_r"
        }else{
            return 0.1
        }

        return null
    }, undefined, DoUniqueString("time"), 0.7)

    GameRules.GetGameModeEntity().SetThink(() => {
        if(overSign.state != "ability_r"){
            return 0.1
        }
        AbilityOrItemSnapContainer.get(version).forEach(snap => {
            snap.restore()
        })
        overSign.state = "modifier_r"
        return null
    }, undefined, DoUniqueString("time"), 1.5)


    GameRules.GetGameModeEntity().SetThink(() => {
        if(overSign.state != "modifier_r"){
            return 0.1
        }
        EntitySnapContainer.get(version).forEach(snap => {
            const modifiers = snap.getData().modifiers
            modifiers.forEach(snap => {
                snap.restore()
            })
        })
        overSign.state = "build_link"
        return null
    }, undefined, DoUniqueString("time"), 2)



    GameRules.GetGameModeEntity().SetThink(() => {
        if(overSign.state != "build_link"){
            return 0.1
        }
        EntitySnapContainer.get(version).forEach(snap => {
            snap.PostModifier()
        })

        builds.update()
        const all = builds.get();
        const good = Object.values(all).filter(elm => elm.GetTeam() == DotaTeam.GOODGUYS)
        const bad = Object.values(all).filter(elm => elm.GetTeam() == DotaTeam.BADGUYS)

        bad.forEach(newEntity => {
            BadConnect[newEntity.GetName()]?.fn(newEntity as CDOTA_BaseNPC_Building)
        })

        good.forEach(newEntity => {
            GoodConnet[newEntity.GetName()]?.fn(newEntity as CDOTA_BaseNPC_Building)
        })
       overSign.state = "reset"
        return null
    }, undefined, DoUniqueString("time"), 2.3)



    GameRules.GetGameModeEntity().SetThink(() => {
        if(overSign.state != "reset"){
            return 0.1
        }

        heroPlayerSnapContainer.get(version).forEach(snap => {
            snap.uidPtr.oldEntityindex = snap.uidPtr.newEntityindex
            const modifier = snap.getData().modifiers;
            // modifier?.forEach(msnap => {
            //     msnap.data.selfUidPtr.oldEntityindex = msnap.data.selfUidPtr.newEntityindex
            //     if (msnap.data.casterUidPtr) {
            //         msnap.data.casterUidPtr.oldEntityindex = msnap.data.selfUidPtr.newEntityindex
            //     }
            // })
        })

        BotSnapContainer.get(version).forEach(snap => {
            snap.uidPtr.oldEntityindex = snap.uidPtr.newEntityindex
            const modifier = snap.getData().modifiers;
            // modifier?.forEach(msnap => {
            //     msnap.data.selfUidPtr.oldEntityindex = msnap.data.selfUidPtr.newEntityindex
            //     if (msnap.data.casterUidPtr) {
            //         msnap.data.casterUidPtr.oldEntityindex = msnap.data.selfUidPtr.newEntityindex
            //     }
            // })
        })

        EntitySnapContainer.get(version).forEach(snap => {
            snap.uidPtr.oldEntityindex = snap.uidPtr.newEntityindex
            const modifier = snap.getData().modifiers;
            // modifier.forEach(msnap => {
            //     msnap.data.selfUidPtr.oldEntityindex = msnap.data.selfUidPtr.newEntityindex
            //     if (msnap.data.casterUidPtr) {
            //         msnap.data.casterUidPtr.oldEntityindex = msnap.data.selfUidPtr.newEntityindex
            //     }

            // })
        })

        AbilityOrItemSnapContainer.get(version).forEach(snap => {
            snap.ptrUid.oldEntityindex = snap.ptrUid.newEntityindex
        })

        PauseGame(true)

        collectgarbage("collect")

        GlobalConfigSave.Reload()
        return null
    }, undefined, DoUniqueString("time"), 4)


    FireGameEvent("dota_hud_error_message",
        {
            "splitscreenplayer": 0,
            "reason": 80,
            "message": "载入切片 version:" + version,
        } as never)

}