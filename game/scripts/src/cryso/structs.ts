
// ================= 基础结构 =================
function simpleDebugWarring(message: string) {
    Warning(message);
    Warning(`source:${debug.getinfo(3).short_src} line:${debug.getinfo(3).currentline} pop!`);
    Warning(`source:${debug.getinfo(4).short_src} line:${debug.getinfo(4).currentline} pop!`);
}

interface UnitTimerData {
    entityId: EntityIndex;        // 绑定单位
    fnName: string;               // 定时器逻辑的注册名
    interval: number;             // 总时间
    remaining?: number;            // 剩余时间
    repeat: boolean;              // 是否重复
    args?: any;                   // 附加参数，可选
}

type TimerFunction = (entityId: EntityIndex, args?: any) => void;

class TimerRegistry {
    private static fnMap: Record<string, TimerFunction> = {};

    static register(name: string, fn: TimerFunction) {
        this.fnMap[name] = fn;
    }

    static get(name: string): TimerFunction | undefined {
        return this.fnMap[name];
    }
}



export class UnitTimerSystem {
    private timers: UnitTimerData[] = [];
    private static instance: UnitTimerSystem;

    // 添加单例访问方法
    static Get(): UnitTimerSystem {
        if (!UnitTimerSystem.instance) {
            UnitTimerSystem.instance = new UnitTimerSystem();
        }
        return UnitTimerSystem.instance;
    }


    add(timer: UnitTimerData) {
        this.timers.push(timer);
        this.Start(timer)
    }

    tick(dt: number) {
        for (const timer of this.timers) {
            timer.remaining -= dt;
            if (timer.remaining <= 0) {
                const fn = TimerRegistry.get(timer.fnName);
                if (fn) {
                    fn(timer.entityId, timer.args);
                }

                if (timer.repeat) {
                    timer.remaining = timer.interval;
                } else {
                    // 单次定时器移除
                    this.timers = this.timers.filter(t => t !== timer);
                }
            }
        }
    }

    // 序列化所有 timer
    serialize(): UnitTimerData[] {
        return this.timers;
    }

    public Start(timer:UnitTimerData){
        const ent = EntIndexToHScript(timer.entityId) as CDOTA_BaseNPC;
    
        if (!IsValidEntity(ent)) return;

        // 注册单位上的 Think 回调
        const thinkFunc = () => {
            const fn = TimerRegistry.get(timer.fnName);
            if (fn) {
                fn(timer.entityId, timer.args);
            }

            if (timer.repeat) {
                // 重复，重新设置 remaining
                timer.remaining = timer.interval;
                return timer.interval; // 再次调用间隔时间
            } else {
                // 单次执行完移除
                this.timers = this.timers.filter(t => t !== timer);
                return undefined; // 不再调用
            }
        };

        ent.SetThink(thinkFunc, undefined,DoUniqueString("timer"),undefined);
    }

    deserialize(data: UnitTimerData[]) {
        this.timers = [...data];
    
        this.timers.forEach(timer => {
            this.Start(timer)
        });
    }
    
}



export class SceneSerializer {
    static serialize(): string {
        const state = {
            system: SystemContainer.Get().toJSON(),
            triggers: TriggerController.Get().toJSON(),
            scheduler: TriggerController.Get().getScheduler()?.toJSON(),
            unitTimers: UnitTimerSystem.Get().serialize() // 新增序列化单位计时器
        };
        return JSON.encode(state);
    }

    static deserialize(jsonString: string): void {
        const state = JSON.decode(jsonString);
        
        // 重置系统
        SystemContainer.Get().reset();
        TriggerController.Get().reset();
        
        // 重建数据集
        state.system.dataSets.forEach((dsData: any) => {
            const ds = DataSet.fromJSON(dsData);
            SystemContainer.Get().registerDataSet(ds.id, ds);
        });
        
        // 重建触发器
        const triggerMap = new Map<string, Trigger>();
        state.triggers.forEach((triggerData: any) => {
            const trigger = Trigger.fromJSON(triggerData);
            triggerMap.set(trigger.getId(), trigger);
            TriggerController.Get().register(trigger);
        });
        
        // 重建调度器（传入触发器映射）
        if (state.scheduler) {
            const scheduler = Scheduler.fromJSON(state.scheduler, triggerMap);
            TriggerController.Get().setScheduler(scheduler);
        }
        
        // 新增：重建单位计时器
        if (state.unitTimers) {
            UnitTimerSystem.Get().deserialize(state.unitTimers);
        }
        
        // 解析所有引用
        TriggerController.Get().resolveReferences();
    }
}
// ================= Trigger 系统 =================


interface BaseMatcher {
    __Sign__: "matcher";
    type: "range" | "le" | "ge" | "eq" | "custom";
    raw: any;
    min?: number;
    max?: number;
    reset?: boolean;
}

function le(threshold: number): BaseMatcher {
    return {
        __Sign__: "matcher",
        type: "le",
        raw: threshold,
    };
}

function rangef(min: number, max: number): BaseMatcher {
    return {
        __Sign__: "matcher",
        type: "range",
        raw: [min, max],
        min,
        max,
    };
}
/**
 * Trigger 触发器类
 * 用于监控 DataSet 字段变化并在满足条件时执行回调
 */
export class Trigger<T = any> {
    private id: string;
    private conditions: QueryCondition[] = [];
    private callback?: (dataSets: DataSet[], trigger: Trigger<T>) => void;
    private context?: T;
    private lastTriggeredDataSets: DataSet[] = [];
    private triggerCount: number = 0;

    constructor() {
        this.id = DoUniqueString("uid") + DoUniqueString("uid")
    }

    static New() {
        return new this()
    }

    toJSON() {
        return {
            id: this.id,
            conditions: this.conditions,
            lastTriggeredDataSets: this.lastTriggeredDataSets.map(ds => ds.id), // 只保存 UID
            triggerCount: this.triggerCount,
            context: this.context
        };
    }

    static fromJSON(json: any): Trigger {
        const trigger = new Trigger();
        trigger.id = json.id || DoUniqueString("uid") + DoUniqueString("uid");
        trigger.conditions = json.conditions || [];
        trigger.lastTriggeredDataSets = []; // 需要后续解析
        trigger.triggerCount = json.triggerCount || 0;
        trigger.context = json.context;
        return trigger;
    }

    // 在系统完全加载后调用此方法
    resolveReferences(system: SystemContainer): void {
        // 确保处理的是 UID 数组
        const uids = this.lastTriggeredDataSets || [];
        this.lastTriggeredDataSets = uids
            .map((dataset) => system.getDataSetByUid(dataset.id))
            .filter((ds): ds is DataSet => !!ds); // 类型守卫
    }
    /**
     * 添加检查条件
     * @param condition 查询条件
     */
    check(condition: QueryCondition): this {
        this.conditions.push(condition);
        return this;
    }

    /**
     * 设置触发回调函数
     * @param callback 回调函数
     */
    call(callback: (dataSets: DataSet[], trigger: Trigger<T>) => void): this {
        this.callback = callback;
        return this;
    }

    /**
     * 设置触发器上下文
     * @param context 上下文对象
     */
    withContext(context: T): this {
        this.context = context;
        return this;
    }

    /**
     * 获取触发器ID
     */
    getId(): string {
        return this.id;
    }

    /**
     * 获取触发器上下文
     */
    getContext(): T | undefined {
        return this.context;
    }

    /**
     * 获取上次触发时的数据集
     */
    getLastTriggeredDataSets(): DataSet[] {
        return this.lastTriggeredDataSets;
    }

    /**
     * 获取触发器被触发的总次数
     */
    getTriggerCount(): number {
        return this.triggerCount;
    }

    /**
     * 检查条件是否满足
     * @param dataSet 数据集
     */
    public isConditionMet(dataSet: DataSet): boolean {
        return this.conditions.every(condition =>
            QueryEngine.execute(dataSet, condition)
        );
    }

    /**
     * 执行触发器
     * @param dataSets 满足条件的数据集
     */
    execute(dataSets: DataSet[]): void {
        if (!this.callback || dataSets.length === 0) return;

        this.lastTriggeredDataSets = [...dataSets];
        this.triggerCount++;

        // 异步执行回调
        Promise.resolve().then(() => {
            this.callback!(dataSets, this);
        });
    }
}

/**
 * Scheduler 计划表
 * 用于管理 Trigger 的执行顺序
 */
export class Scheduler {
    private phases: Map<string, Trigger[]> = new Map();
    private phaseOrder: string[] = [];
    private dependencies: Map<string, { before: Set<string>, after: Set<string> }> = new Map();

    /**
     * 添加阶段
     * @param phase 阶段名称
     * @param order 顺序值（可选）
     */
    phase(phase: string, order?: number): this {
        if (!this.phases.has(phase)) {
            this.phases.set(phase, []);
            if (order !== undefined) {
                this.phaseOrder.splice(order, 0, phase);
            } else {
                this.phaseOrder.push(phase);
            }
        }
        return this;
    }

    /**
     * 添加触发器到指定阶段
     * @param trigger 触发器
     * @param phase 阶段名称
     */
    addTrigger(trigger: Trigger, phase: string): this {
        if (!this.phases.has(phase)) {
            this.phase(phase);
        }
        this.phases.get(phase)!.push(trigger);
        return this;
    }
    toJSON(): any {
        return {
            phases: Array.from(this.phases.entries()).map(([phase, triggers]) => ({
                phase,
                triggers: triggers.map(t => t.getId()) // 只存储ID
            })),
            phaseOrder: this.phaseOrder,
            dependencies: Array.from(this.dependencies.entries()).map(([id, deps]) => ({
                triggerId: id,
                before: Array.from(deps.before),
                after: Array.from(deps.after)
            }))
        };
    }

    static fromJSON(json: any, triggerMap: Map<string, Trigger>): Scheduler {
        const scheduler = new Scheduler();
        scheduler.phaseOrder = json.phaseOrder;
        
        // 重建阶段
        json.phases.forEach(({ phase, triggers }: any) => {
            scheduler.phase(phase);
            // 直接解析触发器引用
            triggers.forEach((triggerId: string) => {
                const trigger = triggerMap.get(triggerId);
                if (trigger) {
                    scheduler.addTrigger(trigger, phase);
                }
            });
        });
        
        // 重建依赖
        json.dependencies.forEach((dep: any) => {
            scheduler.dependencies.set(dep.triggerId, {
                before: new Set(dep.before),
                after: new Set(dep.after)
            });
        });
        
        return scheduler;
    }


    // 在触发器加载后调用此方法
    resolveTriggers(triggerMap: Map<string, Trigger>): void {
        // 重建阶段中的触发器引用
        this.phases.forEach((triggers, phase) => {
            const resolvedTriggers = triggers
                .map(id => triggerMap.get(id as any))
                .filter(Boolean) as Trigger[];
            this.phases.set(phase, resolvedTriggers);
        });
    }

    /**
     * 设置触发器执行顺序
     * @param triggerId 触发器ID
     * @param options 顺序选项 { before?: string, after?: string }
     */
    order(triggerId: string, options: { before?: string, after?: string }): this {
        if (!this.dependencies.has(triggerId)) {
            this.dependencies.set(triggerId, { before: new Set(), after: new Set() });
        }

        const deps = this.dependencies.get(triggerId)!;

        if (options.before) {
            deps.before.add(options.before);
        }

        if (options.after) {
            deps.after.add(options.after);
        }

        return this;
    }

    /**
     * 获取所有触发器（按阶段顺序和依赖关系排序）
     */
    getTriggers(): Trigger[] {
        const allTriggers: Trigger[] = [];

        // 按阶段顺序收集所有触发器
        for (const phase of this.phaseOrder) {
            const triggers = this.phases.get(phase) || [];
            allTriggers.push(...triggers);
        }


        // 应用依赖关系排序
        return this.sortTriggers(allTriggers);
    }

    /**
     * 根据依赖关系对触发器进行排序
     * @param triggers 触发器数组
     */
    private sortTriggers(triggers: Trigger[]): Trigger[] {
        const triggerMap = new Map<string, Trigger>();
        const graph: Map<string, Set<string>> = new Map();
        const indegree: Map<string, number> = new Map();

        // 初始化
        triggers.forEach(trigger => {
            const id = trigger.getId();
            triggerMap.set(id, trigger);
            graph.set(id, new Set());
            indegree.set(id, 0);
        });

        // 构建依赖图
        triggers.forEach(trigger => {
            const triggerId = trigger.getId();
            const deps = this.dependencies.get(triggerId);

            if (deps) {
                // 处理 before 依赖：当前触发器需要在指定触发器之前执行
                deps.before.forEach(beforeId => {
                    if (triggerMap.has(beforeId)) {
                        graph.get(triggerId)!.add(beforeId);
                        indegree.set(beforeId, (indegree.get(beforeId) || 0) + 1);
                    }
                });

                // 处理 after 依赖：当前触发器需要在指定触发器之后执行
                deps.after.forEach(afterId => {
                    if (triggerMap.has(afterId)) {
                        graph.get(afterId)!.add(triggerId);
                        indegree.set(triggerId, (indegree.get(triggerId) || 0) + 1);
                    }
                });
            }
        });

        // 拓扑排序
        const queue: string[] = [];
        indegree.forEach((degree, id) => {
            if (degree === 0) {
                queue.push(id);
            }
        });

        const sorted: Trigger[] = [];
        while (queue.length > 0) {
            queue.sort(); // 确保顺序一致性
            const id = queue.shift()!;
            sorted.push(triggerMap.get(id)!);

            graph.get(id)?.forEach(neighborId => {
                const currentDegree = indegree.get(neighborId)! - 1;
                indegree.set(neighborId, currentDegree);

                if (currentDegree === 0) {
                    queue.push(neighborId);
                }
            });
        }

        // 检查循环依赖
        if (sorted.length !== triggers.length) {
            simpleDebugWarring("Scheduler: Cyclic dependency detected in trigger ordering");
            return triggers; // 返回原始顺序
        }

        return sorted;
    }
}

/**
 * TriggerController 触发器控制器
 * 管理所有触发器的执行
 */
export class TriggerController {
    private static instance: TriggerController;
    private triggers: Map<string, Trigger> = new Map();
    private dirtyDataSets: Set<UID> = new Set();
    private scheduler?: Scheduler;
    private frameEndHandler = async () => this.processDirtyDataSets();
    /**帧更新是否已经激活  将在主线程执行完毕后 执行异步 */
    private isAcitve: boolean = false

    private constructor() { }

    static Get(): TriggerController {
        if (!TriggerController.instance) {
            TriggerController.instance = new TriggerController();
        }
        return TriggerController.instance;
    }

    // 添加触发器映射表获取方法
    getTriggerMap(): Map<string, Trigger> {
        return new Map(this.triggers);
    }

    toJSON(): any {
        return {
            triggers: Array.from(this.triggers.values()).map(t => t.toJSON()),
            dirtyDataSets: Array.from(this.dirtyDataSets),
            isActive: this.isAcitve
        };
    }

    getScheduler(): Scheduler | undefined {
        return this.scheduler;
    }

    resolveReferences(): void {
        const system = SystemContainer.Get();
        this.triggers.forEach(trigger => {
            trigger.resolveReferences(system);
        });
    }

    /**
     * 注册触发器
     * @param trigger 触发器
     */
    register(trigger: Trigger): void {
        if (this.triggers.has(trigger.getId())) {
            simpleDebugWarring(`Trigger with id '${trigger.getId()}' already registered`);
            return;
        }
        this.triggers.set(trigger.getId(), trigger);
    }

    /**
     * 设置计划表
     * @param scheduler 计划表
     */
    setScheduler(scheduler: Scheduler): void {
        this.scheduler = scheduler;
    }

    /**
     * 标记数据集为脏（已修改）
     * @param uid 数据集UID
     */
    markDirty(uid: UID): void {
        this.dirtyDataSets.add(uid);
        this.ensureFrameEndHandler();
    }

    /**
     * 确保帧结束处理程序已注册
     */
    private ensureFrameEndHandler(): void {

        if (this.isAcitve == false) {
            this.isAcitve = true
            this.frameEndHandler()
        }
    }

    /**
     * 处理脏数据集并触发符合条件的触发器
     */
    private processDirtyDataSets(): void {
        if (this.dirtyDataSets.size === 0) return;

        const system = SystemContainer.Get();
        const dirtyDataSets: DataSet[] = [];

        // 获取所有脏数据集实例
        this.dirtyDataSets.forEach(uid => {
            const ds = system.getDataSetByUid(uid);
            if (ds) dirtyDataSets.push(ds);
        });



        if (dirtyDataSets.length === 0) return;

        // 获取按计划表排序的触发器
        const triggers = this.scheduler?.getTriggers() || Array.from(this.triggers.values());


        // 执行所有触发器
        triggers.forEach(trigger => {
            // 筛选满足当前触发器条件的数据集
            const triggeredDataSets = dirtyDataSets.filter(ds =>
                trigger.isConditionMet(ds)
            );

            if (triggeredDataSets.length > 0) {
                trigger.execute(triggeredDataSets);
            }
        });

        // 清空脏数据集集合
        this.dirtyDataSets.clear();
        this.isAcitve = false
    }

    /**
     * 获取所有已注册的触发器
     */
    getAllTriggers(): Trigger[] {
        return Array.from(this.triggers.values());
    }

    /**
     * 根据ID获取触发器
     * @param id 触发器ID
     */
    getTrigger(id: string): Trigger | undefined {
        return this.triggers.get(id);
    }

    /**
     * 重置控制器（清除所有触发器和脏数据）
     */
    reset(): void {
        this.triggers.clear();
        this.dirtyDataSets.clear();
        this.scheduler = undefined;
        this.frameEndHandler = undefined;
    }
}

class TupleKeyMap<K extends readonly (string | number | symbol)[], V> {
    private map = new Map<string, { key: K; value: V }>();

    private serializeKey(key: K): string {
        return key.join("|");
    }

    set(key: K, value: V): this {
        const serialized = this.serializeKey(key);
        this.map.set(serialized, { key, value });
        return this;
    }

    get(key: K): V | undefined {
        const serialized = this.serializeKey(key);
        return this.map.get(serialized)?.value;
    }

    has(key: K): boolean {
        const serialized = this.serializeKey(key);
        return this.map.has(serialized);
    }

    delete(key: K): boolean {
        const serialized = this.serializeKey(key);
        return this.map.delete(serialized);
    }

    forEach(callback: (value: V, key: K) => void): void {
        this.map.forEach(entry => {
            callback(entry.value, entry.key);
        });
    }

    clear(): void {
        this.map.clear();
    }
}

function ref(target: UID | DataSet | (() => UID)): UID {
    if (typeof target === 'string') {
        return target;
    } else if (target instanceof DataSet) {
        // 自动注册数据集到系统容器
        const system = SystemContainer.Get();
        if (!system.getDataSetByUid(target.id)) {
            system.registerDataSet(target.id, target);
        }
        return target.id;
    } else if (typeof target === 'function') {
        return target();
    }
    simpleDebugWarring("Invalid reference type");
    return ""; // 返回空字符串作为fallback
}

type UID = string;
type TagName = string; // 简化为字符串类型

interface Tag {
    // 标签接口（可根据需要扩展）
}

type ValueSign = "Integer" | "Float01" | "Float" | "Bool" | "CBool" | "Str" | "Link";

interface BaseVal<T> {
    raw: T;
}

interface RangeVal {
    min: number;
    max: number;
}

interface ResetVal<T> {
    reset: T;
}

function Range(min: number, max: number): RangeVal {
    return { min, max };
}

function Reset<T>(reset: T): ResetVal<T> {
    return { reset };
}

type ExtraOptions<T> = Partial<RangeVal> & Partial<ResetVal<T>>;

interface TypedVal<T, S extends ValueSign> extends BaseVal<T>, ExtraOptions<T> {
    __Sign__: S;
}

type Integer = TypedVal<number, "Integer">;
type Float01 = TypedVal<number, "Float01">;
type Float = TypedVal<number, "Float">;
type Bool = TypedVal<boolean, "Bool">;
type CBool = TypedVal<number, "CBool">;
type Str = TypedVal<string, "Str">;

// 修改后的 Link 类型
type Link = TypedVal<UID | null, "Link"> & {
    targetName?: string;
};

function Link(target?: UID, targetName?: string): Link {
    return {
        raw: target || null,
        __Sign__: "Link",
        targetName
    };
}

function isRangeVal(obj: any): obj is RangeVal {
    return obj && "min" in obj && "max" in obj;
}

function isResetVal<T>(obj: any): obj is ResetVal<T> {
    return obj && "reset" in obj;
}

function buildVal<T, S extends ValueSign>(
    raw: T,
    sign: S,
    ...options: (RangeVal | ResetVal<T>)[]
): TypedVal<T, S> {
    const val: any = { raw, __Sign__: sign };

    for (const opt of options) {
        if (isRangeVal(opt)) {
            val.min = opt.min;
            val.max = opt.max;
        } else if (isResetVal<T>(opt)) {
            val.reset = opt.reset;
        }
    }

    return val as TypedVal<T, S>;
}

function Integer(raw: number, ...opts: (RangeVal | ResetVal<number>)[]): Integer {
    if (!Number.isInteger(raw)) simpleDebugWarring("Integer must be whole number");
    return buildVal(raw, "Integer", ...opts);
}

function Float01(raw: number, ...opts: (RangeVal | ResetVal<number>)[]): Float01 {
    if (raw < 0 || raw > 1) simpleDebugWarring("Float01 must be in [0, 1]");
    return buildVal(raw, "Float01", ...opts);
}

function Float(raw: number, ...opts: (RangeVal | ResetVal<number>)[]): Float {
    return buildVal(raw, "Float", ...opts);
}

function Bool(raw: boolean, ...opts: ResetVal<boolean>[]): Bool {
    return buildVal(raw, "Bool", ...opts);
}

function CBool(raw: number, ...opts: ResetVal<number>[]): CBool {
    if (raw !== 0 && raw !== 1) simpleDebugWarring("CBool must be 0 or 1");
    return buildVal(raw, "CBool", ...opts);
}

function Str(raw: string, ...opts: ResetVal<string>[]): Str {
    if (typeof raw !== "string") {
        simpleDebugWarring("Str must be string");
    }
    return buildVal(raw, "Str", ...opts);
}

class DataSet {
    public readonly id: UID;
    private fields: Record<string, any> = {};
    public tags: Set<string> = new Set();
    private _owned: Set<EntityIndex> = new Set();
    public links: Record<string, Link> = {};

    constructor() {
        this.id = DoUniqueString("uid") + DoUniqueString("uid")
    }



    static New() {
        return new this();
    }

       
    toJSON(): any {
        const links: Record<string, any> = {};
        for (const [key, link] of Object.entries(this.links)) {
            links[key] = link.raw
                ? { uid: link.raw, name: link.targetName || 'unnamed' }
                : null;
        }

        return {
            id: this.id,
            tags: Array.from(this.tags),
            fields: this.serializeFields(),
            links,
            owned: Array.from(this._owned)
        };
    }

    private serializeFields(): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(this.fields)) {
            if (value && typeof value === 'object' && '__Sign__' in value) {
                const serialized: Record<string, any> = {
                    type: value.__Sign__,
                    raw: value.raw,
                };
    
                if (value.min !== undefined) {
                    serialized.min = value.min;
                }
                if (value.max !== undefined) {
                    serialized.max = value.max;
                }
                if (value.reset !== undefined) {
                    serialized.reset = value.reset;
                }
    
                result[key] = serialized;
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    static fromJSON(json: any): DataSet {
        const ds = new DataSet();
        // 保留原始ID以确保引用一致性
        (ds as any).id = json.id;
        
        // 恢复标签
        json.tags.forEach((tag: string) => ds.tags.add(tag));
        
        // 恢复字段
        ds.fields = this.deserializeFields(json.fields);
        
        // 恢复链接
        Object.keys(json.links).forEach((key:any) => {
            const linkInfo = json.links[key];
            if (linkInfo) {
                ds.links[key] = {
                    raw: linkInfo.uid,
                    __Sign__: "Link",
                    ...(linkInfo.name && { targetName: linkInfo.name })
                };
            }
        });
        
        // 恢复所有者
        ds._owned = new Set(json.owned);
        
        return ds;
    }

    private static deserializeFields(fields: Record<string, any>): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(fields)) {
            // 处理特殊类型字段
            if (value && typeof value === 'object' && 'type' in value) {
                const type = value.type as ValueSign;
                const constructors: Record<ValueSign, Function> = {
                    Integer: Integer,
                    Float01: Float01,
                    Float: Float,
                    Bool: Bool,
                    CBool: CBool,
                    Str: Str,
                    Link: Link
                };
                
                // 使用原始构造函数重建
                const opts = [];
                if (value.min !== undefined && value.max !== undefined) {
                    opts.push(Range(value.min, value.max));
                }
                if (value.reset !== undefined) {
                    opts.push(Reset(value.reset));
                }
                
                result[key] = constructors[type](value.raw, ...opts);
            } else {
                // 普通值
                result[key] = value;
            }
        }
        return result;
    }

    /**
 * 检查字段是否存在
 * @param key 字段名称
 */
    hasField(key: string): boolean {
        return this.fields[key] !== undefined;
    }

    /**
     * 获取字段的完整对象（包含元数据）
     * @param key 字段名称
     */
    getFieldObject(key: string): any {
        return this.fields[key];
    }

    // 修改为接受多种引用类型
    link(key: string, target: UID | DataSet | (() => UID), targetName?: string): this {
        const uid = ref(target);
        this.links[key] = Link(uid, targetName);
        return this;
    }

    // 通过 SystemContainer 解析链接
    getLink(key: string): DataSet | null {
        const link = this.links[key];
        if (!link || !link.raw) return null;
        return SystemContainer.Get().getDataSetByUid(link.raw);
    }

    owned(entity: EntityIndex) {
        this._owned.add(entity);
        return this;
    }

    getOwned() {
        return this._owned
    }

    set<T>(key: string, value: T): this {
        if (typeof value === 'object' && value !== null && '__Sign__' in value) {
            this.validateValue(value);
        }
        this.fields[key] = value;
        return this;
    }

    get<T>(key: string): T | undefined {
        return this.fields[key].raw;
    }

    tag(name: string): this {
        this.tags.add(name);
        return this;
    }

    hasTag(name: string): boolean {
        return this.tags.has(name);
    }

    removeTag(name: string): this {
        this.tags.delete(name);
        return this;
    }

    private validateValue(value: any): void {
        if ('min' in value && 'max' in value) {
            const { min, max } = value as RangeVal;
            if (value.raw < min || value.raw > max) {
                simpleDebugWarring(
                    `Value ${value.raw} is out of range [${min}, ${max}] for ${value.__Sign__}`
                );
            }
        }

        switch (value.__Sign__) {
            case 'Integer':
                if (!Number.isInteger(value.raw)) {
                    simpleDebugWarring(`Integer value must be whole number, got ${value.raw}`);
                }
                break;
            case 'Float01':
                if (value.raw < 0 || value.raw > 1) {
                    simpleDebugWarring(`Float01 value must be in [0, 1], got ${value.raw}`);
                }
                break;
            case 'CBool':
                if (value.raw !== 0 && value.raw !== 1) {
                    simpleDebugWarring(`CBool value must be 0 or 1, got ${value.raw}`);
                }
                break;
        }
    }

    print(): this {
        DeepPrintTable(this.toJSON());
        return this;
    }
}

// 全局静态系统容器
export class SystemContainer {
    private static instance: SystemContainer;
    public dataSets: Map<UID, DataSet> = new Map();
    private tagIndex: Map<TagName, Set<UID>> = new Map();
    private tagsCombinationIndex: TupleKeyMap<TagName[], Set<UID>> = new TupleKeyMap();

    private constructor() { }

    static Get(): SystemContainer {
        if (!SystemContainer.instance) {
            SystemContainer.instance = new SystemContainer();
        }
        return SystemContainer.instance;
    }

    toJSON(): any {
        return {
            dataSets: Array.from(this.dataSets.values()).map(ds => ds.toJSON())
        };
    }

    reset(): void {
        this.dataSets.clear();
        this.tagIndex.clear();
        this.tagsCombinationIndex.clear();
    }

    registerDataSet(uid: UID, dataSet: DataSet): void {
        // 防止重复注册
        if (this.dataSets.has(uid)) {
            simpleDebugWarring(`DataSet with UID ${uid} already registered`);
            return;
        }

        this.dataSets.set(uid, dataSet);

        // 提取数据集的所有标签
        const tags = Array.from(dataSet.tags);

        // 更新标签索引
        tags.forEach(tag => {
            if (!this.tagIndex.has(tag)) {
                this.tagIndex.set(tag, new Set());
            }
            this.tagIndex.get(tag)!.add(uid);
        });

        // 更新标签组合索引
        if (tags.length > 0) {
            const sortedTags = [...tags].sort();
            const existing = this.tagsCombinationIndex.get(sortedTags) || new Set();
            existing.add(uid);
            this.tagsCombinationIndex.set(sortedTags, existing);
        }
    }

    getDataSetByUid(uid: UID): DataSet | undefined {
        return this.dataSets.get(uid);
    }

    getDataSetsByTag(tag: TagName): DataSet[] {
        const uids = this.tagIndex.get(tag);
        if (!uids) return [];
        return Array.from(uids).map(uid => this.dataSets.get(uid)!);
    }

    getDataSetsByTags(tags: TagName[]): DataSet[] {
        // 排序以确保组合顺序一致
        const sortedTags = [...tags].sort();
        const uids = this.tagsCombinationIndex.get(sortedTags);
        if (!uids) return [];
        return Array.from(uids).map(uid => this.dataSets.get(uid)!);
    }

    removeDataSet(uid: UID): boolean {
        const dataSet = this.dataSets.get(uid);
        if (!dataSet) return false;

        // 从标签索引中移除
        this.tagIndex.forEach((uids, tag) => {
            uids.delete(uid);
            if (uids.size === 0) {
                this.tagIndex.delete(tag);
            }
        });

        // 从组合索引中移除 - 修正后的版本
        const tagsToRemoveFrom: TagName[][] = [];

        // 首先收集需要更新的标签组合
        this.tagsCombinationIndex.forEach((uids, tags) => {
            if (uids.has(uid)) {
                tagsToRemoveFrom.push(tags);
            }
        });

        // 然后更新这些组合
        tagsToRemoveFrom.forEach(tags => {
            const uids = this.tagsCombinationIndex.get(tags);
            if (uids) {
                uids.delete(uid);
                if (uids.size === 0) {
                    this.tagsCombinationIndex.delete(tags);
                }
            }
        });

        return this.dataSets.delete(uid);
    }

    // 解析链接的便捷方法
    resolveLink(sourceUid: UID, linkKey: string): DataSet | null {
        const source = this.getDataSetByUid(sourceUid);
        if (!source) return null;
        return source.getLink(linkKey);
    }
}

class DataSetArr {
    private uids: Set<UID> = new Set();
    private _arr: DataSet[] = [];

    constructor(initialItems?: (UID | DataSet | (() => UID))[]) {
        if (initialItems) {
            initialItems.forEach(item => this.add(item));
        }
    }

    static New() {
        return new this();
    }

    // 添加数据集（支持多种引用形式）
    add(target: UID | DataSet | (() => UID)): this {
        const uid = ref(target);
        if (this.uids.has(uid)) return this; // 避免重复添加

        this.uids.add(uid);

        // 更新数组缓存
        const ds = SystemContainer.Get().getDataSetByUid(uid);
        if (ds) {
            this._arr.push(ds);
        }

        return this;
    }

    // 批量创建并添加数据集
    fill(
        count: number,
        callback: (index: number) => DataSet | null
    ): this {
        for (let i = 0; i < count; i++) {
            // 创建唯一ID

            // 调用回调创建数据集
            const ds = callback(i);
            const uid = ref(ds);
            if (ds) {
                // 确保数据集使用我们生成的UID

                // 注册到系统容器
                SystemContainer.Get().registerDataSet(uid, ds);

                // 添加到集合
                this.add(uid);
            }
        }
        return this;
    }

    // 链接另一个 DataSetArr，合并其所有数据集
    link(other: DataSetArr): this {
        other.uids.forEach(uid => {
            if (!this.uids.has(uid)) {
                this.uids.add(uid);

                // 更新数组缓存
                const ds = SystemContainer.Get().getDataSetByUid(uid);
                if (ds) {
                    this._arr.push(ds);
                }
            }
        });
        return this;
    }

    // 获取所有数据集实例（数组）
    getAll(): DataSet[] {
        return [...this._arr];
    }

    // 获取 UID 集合
    getUids(): Set<UID> {
        return new Set(this.uids);
    }

    // 获取数据集数量
    size(): number {
        return this.uids.size;
    }

    // 检查是否包含特定数据集
    has(target: UID | DataSet | (() => UID)): boolean {
        const uid = ref(target);
        return this.uids.has(uid);
    }

    // 转换为数组
    toArray(): DataSet[] {
        return this.getAll();
    }

    // 打印所有数据集
    printAll(): this {
        print(`===== Printing ${this.size()} DataSets =====`);
        this._arr.forEach(ds => ds.print());
        return this;
    }

    // 根据标签筛选数据集
    filterByTag(tag: string): DataSet[] {
        return this._arr.filter(ds => ds.hasTag(tag));
    }

    // 根据多个标签筛选数据集
    filterByTags(tags: string[]): DataSet[] {
        return this._arr.filter(ds => tags.every(tag => ds.hasTag(tag)));
    }

    // 遍历所有数据集
    forEach(callback: (ds: DataSet, index: number) => void): void {
        this._arr.forEach((ds, index) => callback(ds, index));
    }

    // 查找数据集
    find(predicate: (ds: DataSet) => boolean): DataSet | undefined {
        return this._arr.find(predicate);
    }
}
type QueryCondition =
    | TagCondition
    | RangeCondition
    | LinkCondition
    | FieldCondition
    | LogicalCondition
    | CustomCondition
    | OwnedCondition

interface TagCondition {
    type: "tag";
    name: string;
}

function Tag(name: string): TagCondition {
    return { type: "tag", name };
}

function Onwedf(ent: EntityIndex): OwnedCondition {
    return { type: "Owned", ent };
}

interface RangeCondition {
    type: "range";
    key: string;
    min?: number;
    max?: number;
}

function Rangef(key: string, min?: number, max?: number): RangeCondition {
    return { type: "range", key, min, max };
}

interface LinkCondition {
    type: "link";
    key: string;
    condition?: QueryCondition;
    targetName?: string;
}

function Linkf(key: string, condition?: QueryCondition, targetName?: string): LinkCondition {
    return { type: "link", key, condition, targetName };
}

interface FieldCondition {
    type: "field";
    key: string;
    value: any | ((value: any) => boolean);
    exact?: boolean;
    min?: number;
    max?: number;
}
class FieldConditionBuilder {
    private key: string;
    private value: BaseMatcher
    private exact: boolean = true;
    private min: number | null = null;
    private max: number | null = null;

    constructor(key: string) {
        this.key = key;
    }

    equals(value: any): this {
        this.value = value;
        this.exact = true;
        return this;
    }

    includes(value: any): this {
        this.value = value;
        this.exact = false;
        return this;
    }

    between(min: number, max: number): this {
        this.min = min;
        this.max = max;
        return this;
    }

    matches(matcher: BaseMatcher): this {
        this.value = matcher;
        return this;
    }

    build(): FieldCondition {
        if (this.min !== null && this.max !== null) {
            return {
                type: "field",
                key: this.key,
                min: this.min,
                max: this.max,
                value: this.value
            };
        }

        return {
            type: "field",
            key: this.key,
            value: this.value,
            exact: this.exact,
        };
    }
}

function Field(key: string): FieldConditionBuilder {
    return new FieldConditionBuilder(key);
}

interface LogicalCondition {
    type: "and" | "or" | "not";
    conditions: QueryCondition[];
}

interface OwnedCondition {
    type: "Owned"
    ent: EntityIndex,
}

function And(...conditions: QueryCondition[]): LogicalCondition {
    return { type: "and", conditions };
}

function Or(...conditions: QueryCondition[]): LogicalCondition {
    return { type: "or", conditions };
}

function Not(condition: QueryCondition): LogicalCondition {
    return { type: "not", conditions: [condition] };
}

interface CustomCondition {
    type: "custom";
    test: (ds: DataSet) => boolean;
}

function Custom(test: (ds: DataSet) => boolean): CustomCondition {
    return { type: "custom", test };
}

// ================= 查询执行引擎 =================
class QueryEngine {
    static execute(ds: DataSet, condition: QueryCondition): boolean {
        switch (condition.type) {
            case "tag":
                return ds.hasTag(condition.name);
            case "range":
                const field = ds.get<any>(condition.key);
                if (!field || typeof field.raw !== "number") return false;

                const value = field.raw;
                const { min, max } = condition;

                if (min !== undefined && value < min) return false;
                if (max !== undefined && value > max) return false;
                return true;
            case "Owned":
                const is_has = ds.getOwned().has(condition.ent)
                if (is_has) {
                    return true
                }
                return false;
            case "link":
                const linkedDs = ds.getLink(condition.key);
                if (!linkedDs) return false;

                // 检查目标名称
                if (condition.targetName) {
                    const linkObj = ds.links[condition.key];
                    if (!linkObj || linkObj.targetName !== condition.targetName) {
                        return false;
                    }
                }

                // 检查链接对象条件
                if (condition.condition) {
                    return this.execute(linkedDs, condition.condition);
                }
                return true;

                case "field":
                    const fieldValue = ds.get<any>(condition.key);
                    if (fieldValue === undefined) return false;
                
                    // 区间匹配（直接在 FieldCondition 上定义）
                    if (condition.min !== undefined && condition.max !== undefined) {
                        const numValue = Number(fieldValue);
                        if (isNaN(numValue)) return false;
                        return numValue >= condition.min && numValue <= condition.max;
                    }
                
                    const compareValue = condition.value;
                
                    // ✅ 使用结构化 matcher
                    if (compareValue && typeof compareValue === "object" && compareValue.__Sign__ === "matcher") {
                        const numValue = Number(fieldValue);
                        switch (compareValue.type) {
                            case "le":
                                return numValue <= compareValue.raw;
                            case "ge":
                                return numValue >= compareValue.raw;
                            case "eq":
                                return numValue === compareValue.raw;
                            case "range":
                                return numValue >= compareValue.min && numValue <= compareValue.max;
                            case "custom":
                                // 自定义处理，比如命名逻辑、参数等
                            default:
                                return false;
                        }
                    }
                
                    // ✅ 普通匹配
                    if (condition.exact) {
                        return fieldValue === compareValue;
                    } else {
                        return String(fieldValue).includes(String(compareValue));
                    }

            case "and":
                return condition.conditions.every(c => this.execute(ds, c));

            case "or":
                return condition.conditions.some(c => this.execute(ds, c));

            case "not":
                return !this.execute(ds, condition.conditions[0]);

            case "custom":
                return condition.test(ds);

            default:
                return false;
        }
    }
}

// ================= 增强型查询函数 =================
function find(
    condition: QueryCondition,
    scope?: DataSetArr | DataSet[]
): DataSet[] {
    let searchSet: DataSet[] = [];

    // 确定查询范围
    if (scope instanceof DataSetArr) {
        searchSet = scope.getAll();
    } else if (Array.isArray(scope)) {
        searchSet = scope;
    } else {
        // 默认搜索全局所有数据集
        const system = SystemContainer.Get();
        searchSet = Array.from(system.dataSets.values());
    }

    // 执行查询
    return searchSet.filter(ds => QueryEngine.execute(ds, condition));
}

// ================= 修改现有函数以支持 Trigger 系统 =================

// 修改 inc 函数以标记脏数据
export function inc(
    key: string,
    value: number,
    condition: QueryCondition,
    scope?: DataSetArr | DataSet[]
): void {
    const targets = find(condition, scope);
    const controller = TriggerController.Get();

    for (const ds of targets) {
        if (!ds.hasField(key)) continue;

        const field = ds.getFieldObject(key);

        // 只处理数值类型字段
        if (field && field.raw !== undefined && typeof field.raw === 'number') {
            let newValue = field.raw + value;

            // 应用范围限制
            if ('min' in field && 'max' in field) {
                newValue = Math.max(field.min, Math.min(field.max, newValue));
            }

            // 特殊类型处理
            switch (field.__Sign__) {
                case 'Integer':
                    newValue = Math.round(newValue);
                    break;
                case 'Float01':
                    newValue = Math.max(0, Math.min(1, newValue));
                    break;
                case 'CBool':
                    newValue = newValue > 0.5 ? 1 : 0;
                    break;
            }

            // 更新字段值
            ds.set(key, { ...field, raw: newValue });

            // 标记数据集为脏
            controller.markDirty(ds.id);
        }
    }
}

// 修改 set 函数以标记脏数据
export function set(
    key: string,
    value: any,
    condition: QueryCondition,
    scope?: DataSetArr | DataSet[]
): void {
    const targets = find(condition, scope);
    const controller = TriggerController.Get();

    for (const ds of targets) {
        if (!ds.hasField(key)) continue;

        const field = ds.getFieldObject(key);
        let newValue = value;

        // 处理特殊类型字段
        if (field && field.__Sign__) {
            switch (field.__Sign__) {
                case 'Integer':
                    if (!Number.isInteger(newValue)) {
                        simpleDebugWarring(`Invalid value for Integer field: ${newValue}`);
                        continue;
                    }
                    break;
                case 'Float01':
                    if (newValue < 0 || newValue > 1) {
                        simpleDebugWarring(`Float01 value out of range: ${newValue}`);
                        newValue = Math.max(0, Math.min(1, newValue));
                    }
                    break;
                case 'CBool':
                    if (newValue !== 0 && newValue !== 1) {
                        simpleDebugWarring(`Invalid CBool value: ${newValue}`);
                        newValue = newValue ? 1 : 0;
                    }
                    break;
                case 'Link':
                    simpleDebugWarring("Cannot directly set Link field. Use link method instead.");
                    continue;
            }

            // 应用范围限制
            if ('min' in field && 'max' in field && typeof newValue === 'number') {
                newValue = Math.max(field.min, Math.min(field.max, newValue));
            }

            // 保留字段的元数据
            ds.set(key, { ...field, raw: newValue });
        } else {
            // 普通字段直接设置
            ds.set(key, newValue);
        }

        // 标记数据集为脏
        controller.markDirty(ds.id);
    }
}

// // 增加所有玩家的生命值
// inc('health', 10, Tag('player'));

// // 设置团队A玩家的等级
// set('level', 5, And(Tag('player'), Tag('teamA')));

// // 重置所有武器的伤害值
// const weapons = new DataSetArr().fill(5, i => 
//     DataSet.New()
//         .tag('weapon')
//         .set('damage', Integer(50, Reset(50)))
// );

// set('damage', 50, Tag('weapon'), weapons);

// 测试用例
export function test() {

    const scheduler = new Scheduler()
        .phase("preparation", 0)
        .phase("main_logic", 1)
        .phase("cleanup", 2)

    const levelUpTrigger = Trigger.New()
        .check(Field("level").matches(le(10)).build())
        .call((dataSets) => {
            print(`恭喜: ${dataSets.length}个单位升级了!`);
        });

    //指定触发顺序
    scheduler.addTrigger(levelUpTrigger, "preparation")

    const controller = TriggerController.Get();
    controller.setScheduler(scheduler);
    controller.register(levelUpTrigger)

    // 创建玩家数据集
    const player1 = DataSet.New()
        .tag('player')
        .tag('teamA')
        .set('name', Str("张三"))
        .set('level', Integer(5))
        .set('health', Float(75.5));

    const player2 = DataSet.New()
        .tag('player')
        .tag('teamB')
        .set('name', Str("李四"))
        .set('level', Integer(8))
        .set('health', Float(90.0));

    const player3 = DataSet.New()
        .tag('player')
        .tag('teamA')
        .set('name', Str("王五"))
        .set('level', Integer(3))
        .set('health', Float(50.0));

    // 创建武器数据集
    const sword = DataSet.New()
        .tag('weapon')
        .set('name', Str("王者之剑"))
        .set('damage', Integer(50))
        .link("owner", player1, "main_weapon");

    const axe = DataSet.New()
        .tag('weapon')
        .set('name', Str("黄金战斧"))
        .set('damage', Integer(65))
        .link("owner", player2, "main_weapon");

    const staff = DataSet.New()
        .tag('weapon')
        .set('name', Str("魔法法杖"))
        .set('damage', Integer(35))
        .link("owner", player3, "main_weapon");

    // 玩家链接到武器
    player1
        .link("weapon", sword)
        .owned(HeroList.GetHero(0).entindex())
        .tag("player")
    player2
        .link("weapon", axe)
        .owned(HeroList.GetHero(0).entindex())
        .tag("player")

    player3
        .link("weapon", staff)
        .owned(HeroList.GetHero(0).entindex())
        .tag("player")


    // 创建防具数据集
    const armor1 = DataSet.New()
        .tag('armor')
        .set('name', Str("青铜铠甲"))
        .set('defense', Integer(20))
        .link("owner", player1);

    const armor2 = DataSet.New()
        .tag('armor')
        .set('name', Str("白银护甲"))
        .set('defense', Integer(30))
        .link("owner", player2);

    // 7. 查找拥有防具的玩家
    const playersWithArmor = find(
        And( Linkf("weapon"), Tag("player"), Onwedf(HeroList.GetHero(0).entindex())));

    inc("level",5,Tag("player"));

    playersWithArmor.forEach(e => {
        print(e.get<number>("level"))
    })

    TimerRegistry.register("ttt",(entindex,)=>{
        print("当前我的entity",entindex)
    })

    UnitTimerSystem.Get().add({
        interval:5,
        entityId:HeroList.GetHero(0).entindex(),
        fnName:"ttt",
        repeat:true
    })




    const currentState = SceneSerializer.serialize();
    print(currentState)

}

