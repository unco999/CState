export const container: Record<string, Record<number, any>> = {};

export class DataBuilder {
    private path: string;
    private owner?: { ownerType: string; id: number };
    private fields: Record<string, any> = {};
    private links: Record<string, any> = {};

    constructor(path: string) {
        this.path = path;
        container[path] = container[path] || {};
    }

    dota_raw_entity(raw: any): DataBuilder {
        // 获取实体 ID
        let ownerId: number;
        if (raw && typeof raw.GetEntityIndex === 'function') {
            ownerId = raw.GetEntityIndex();
        } else {
            ownerId = Number(raw);
        }
        this.owner = OwnedEntity(ownerId);
        // 在 container 中初始化对应条目并记录原始实体
        container[this.path][ownerId] = container[this.path][ownerId] || {};
        container[this.path][ownerId].dota_raw_entity = raw;
        return this;
    }

    dota_raw_player_id(pid: number): DataBuilder {
        this.owner = OwnedPlayer(pid);
        container[this.path][pid] = container[this.path][pid] || {};
        container[this.path][pid].dota_raw_player_id = pid;
        return this;
    }


    field(fields: Record<string, BaseFieldType>): DataBuilder {
        const rawValues: Record<string, number> = {};
        for (const key in fields) {
            const field = fields[key];
            rawValues[key] = resolveFieldValue(field);
            this.fields[key] = field;
        }

        if (this.owner) {
            const entry = container[this.path][this.owner.id] || {};
            container[this.path][this.owner.id] = {
                ...entry,
                fields: {
                    ...entry.fields,
                    ...rawValues
                },
                meta_fields: {
                    ...entry.meta_fields,
                    ...this.fields
                }
            };
        }

        return this;
    }

    link(name: string, refObj: any): DataBuilder {
        this.links[name] = refObj;
        if (this.owner) {
            // 合并引用到 container
            container[this.path][this.owner.id] = {
                ...container[this.path][this.owner.id],
                links: this.links,
            };
        }
        return this;
    }
}

export function DATA(path: string): DataBuilder {
    return new DataBuilder(path);
}

type BaseFieldType =
    | ReturnType<typeof float01>
    | ReturnType<typeof int>
    | ReturnType<typeof bool>
    | ReturnType<typeof boolN>;

export function float01(
    value: number,
    reset: number = 0,
    min: number = 0,
    max: number = 0
) {
    return { kind: 'float1', value, reset, min, max };
}

export function int(
    value: number,
    reset: number = 0,
    min: number = 0,
    max: number = 0
) {
    return { kind: 'int', value, reset, min, max };
}

export function bool(value: boolean, reset: boolean = false) {
    return { kind: 'bool', value, reset };
}

export function boolN(value: boolean, reset: boolean = false) {
    return { kind: 'boolN', value, reset };
}

export function OwnedEntity(id: number) {
    return { ownerType: 'entity', id };
}

export function OwnedPlayer(id: number) {
    return { ownerType: 'player', id };
}

export function ref(
    path: string,
    owner: { ownerType: string; id: number }
) {
    return { path, owner };
}

function resolveFieldValue(field: BaseFieldType): any {
    switch (field.kind) {
        case "float1":
        case "int":
            return field.value;
        case "bool":
        case "boolN":
            return field.value ? 1 : 0;
        default:
            print(`Unknown field kind: ${(field as any).kind}`);
    }
}


export function set(pathStr: string, value: number | boolean) {
    const [path, field] = pathStr.split(".");
    const group = container[path];
    if (!group) return;

    for (const id in group) {
        const entry = group[+id];
        if (entry.meta_fields?.[field]) {
            entry.meta_fields[field].value = value;
        }
        if (entry.fields) {
            entry.fields[field] = value;
        }
    }
}


export function inc(pathStr: string, delta: number) {
    const [path, field] = pathStr.split(".");
    const group = container[path];
    if (!group) return;

    for (const id in group) {
        const entry = group[+id];
        if (entry.meta_fields?.[field]) {
            entry.meta_fields[field].value += delta;
        }
        if (entry.fields?.[field] != null) {
            entry.fields[field] += delta;
        }
    }
}

function test() {
    DATA("zhangsan")
        .dota_raw_entity(HeroList.GetHero(0))
        .dota_raw_player_id(0)
        .field({
            "zhangsan": float01(1),
        })

        
}


type ProgramUnit = string | ProgramBuilder;

interface ProgramNode {
  name: string;
  dependenciesBefore: string[]; // 在谁前面执行
  dependenciesAfter: string[];  // 在谁后面执行
  tasks: string[];              // 本 Program 的任务列表
}

const programRegistry: Record<string, ProgramNode> = {};


class ProgramBuilder {
    private node: ProgramNode;
  
    constructor() {
      this.node = {
        name: '',
        dependenciesBefore: [],
        dependenciesAfter: [],
        tasks: []
      };
    }
  
    name(name: string): ProgramBuilder {
      this.node.name = name;
      programRegistry[name] = this.node;
      return this;
    }
  
    add(...tasks: ProgramUnit[]): ProgramBuilder {
      for (const task of tasks) {
        if (typeof task === 'string') {
          this.node.tasks.push(task);
        } else if (task instanceof ProgramBuilder) {
          this.node.tasks.push(task.getName());
        }
      }
      return this;
    }
  
    after(...programs: ProgramUnit[]): ProgramBuilder {
      for (const p of programs) {
        if (typeof p === 'string') {
          this.node.dependenciesAfter.push(p);
        } else if (p instanceof ProgramBuilder) {
          this.node.dependenciesAfter.push(p.getName());
        }
      }
      return this;
    }
  
    before(...programs: ProgramUnit[]): ProgramBuilder {
      for (const p of programs) {
        if (typeof p === 'string') {
          this.node.dependenciesBefore.push(p);
        } else if (p instanceof ProgramBuilder) {
          this.node.dependenciesBefore.push(p.getName());
        }
      }
      return this;
    }
  
    getName(): string {
      return this.node.name;
    }
  }


  function FindProgram(name: string): ProgramBuilder {
    const node = programRegistry[name];
    if (!node) throw new Error(`Program ${name} not found`);
    const builder = new ProgramBuilder();
    builder.name(name); // 重用已有 name，但不注册新节点
    return builder;
  }


  function resolveProgramOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
  
    function visit(name: string, path: Set<string>) {
      if (path.has(name)) {
        throw new Error(`Cycle detected in program dependencies: ${[...path, name].join(" -> ")}`);
      }
  
      if (!visited.has(name)) {
        path.add(name);
  
        const node = programRegistry[name];
        if (!node) return;
  
        for (const dep of node.dependenciesAfter) {
          visit(dep, path);
        }
  
        result.push(name);
        visited.add(name);
  
        for (const dep of node.dependenciesBefore) {
          // before 的意思是「我在某人前面」 -> 那某人就应该排后面
          visit(dep, path);
        }
  
        path.delete(name);
      }
    }
  
    for (const name in programRegistry) {
      visit(name, new Set());
    }
  
    return result;
  }


  function PROGRAM(): ProgramBuilder {
    return new ProgramBuilder();
  }
  
  type TriggerCheck = (...args: any[]) => boolean;
type TriggerCondition = (data: any) => boolean;
type TriggerExec = (data: any) => void;

interface TriggerNode {
  name: string;
  checks: TriggerCheck[];
  condition?: TriggerCondition;
  execFn?: TriggerExec;
  dependenciesBefore: string[];
  dependenciesAfter: string[];
}

const triggerRegistry: Record<string, TriggerNode> = {};


class TriggerBuilder {
    private node: TriggerNode;
  
    constructor(name: string) {
      this.node = {
        name,
        checks: [],
        dependenciesBefore: [],
        dependenciesAfter: []
      };
      triggerRegistry[name] = this.node;
    }
  
    check(...conds: TriggerCheck[]): TriggerBuilder {
      this.node.checks.push(...conds);
      return this;
    }
  
    cond(fn: TriggerCondition): TriggerBuilder {
      this.node.condition = fn;
      return this;
    }
  
    exe(fn: TriggerExec): TriggerBuilder {
      this.node.execFn = fn;
      return this;
    }
  
    after(...triggers: (string | TriggerBuilder)[]): TriggerBuilder {
      for (const t of triggers) {
        this.node.dependenciesAfter.push(typeof t === 'string' ? t : t.getName());
      }
      return this;
    }
  
    before(...triggers: (string | TriggerBuilder)[]): TriggerBuilder {
      for (const t of triggers) {
        this.node.dependenciesBefore.push(typeof t === 'string' ? t : t.getName());
      }
      return this;
    }
  
    getName(): string {
      return this.node.name;
    }
  }

  function TRIGGER(name: string): TriggerBuilder {
    return new TriggerBuilder(name);
  }


  function resolveTriggerOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
  
    function visit(name: string, path: Set<string>) {
      if (path.has(name)) throw new Error(`循环依赖: ${[...path, name].join(" -> ")}`);
      if (visited.has(name)) return;
  
      const node = triggerRegistry[name];
      if (!node) return;
  
      path.add(name);
  
      for (const dep of node.dependenciesAfter) visit(dep, path);
      result.push(name);
      visited.add(name);
      for (const dep of node.dependenciesBefore) visit(dep, path);
  
      path.delete(name);
    }
  
    for (const name in triggerRegistry) visit(name, new Set());
    return result;
  }

  
  function runAllTriggers(data: any) {
    const order = resolveTriggerOrder();
    for (const name of order) {
      const trigger = triggerRegistry[name];
  
      // 所有 check 都通过
      const checksPassed = trigger.checks.every(fn => fn(data));
      if (!checksPassed) continue;
  
      // condition 通过
      if (trigger.condition && !trigger.condition(data)) continue;
  
      // 执行体
      if (trigger.execFn) {
        trigger.execFn(data);
      }
    }
  }
// 查询辅助函数
export function all() {
  return { mode: "all" };
}

export function last() {
  return { mode: "last" };
}

export function first() {
  return { mode: "first" };
}

export function owner(ownerObj: { ownerType: string; id: number } | number) {
  return { mode: "owner", owner: ownerObj };
}

// ... 其他代码保持不变 ...

function handleQueryMode(query: any, path: string): any | any[] | undefined {
  const group = container[path];
  if (!group) return query.mode === "all" ? [] : undefined;
  
  const entries = Object.values(group);
  
  switch (query.mode) {
    case "all":
      return entries;
      
    case "last":
      return entries.length > 0 ? entries[entries.length - 1] : undefined;
      
    case "first":
      return entries.length > 0 ? entries[0] : undefined;
      
    case "owner":
      if (!query.owner) {
        print("Missing owner specification");
        return undefined;
      }
      return findByOwner(query.owner, path);
      
    default:
      print(`Unknown query mode: ${query.mode}`);
      return undefined;
  }
}
// 增强版 find 函数
export function find(...args: any[]): any | any[] | undefined {
  // 处理不同调用模式
  if (args.length === 1 && typeof args[0] === "string") {
    // find("Weapon") - 获取所有武器
    return findAll(args[0]);
  } else if (args.length === 2) {
    const [arg1, arg2] = args;
    
    if (typeof arg1 === "object" && typeof arg2 === "string") {
      // find(all(), "Weapon") 模式
      return handleQueryMode(arg1, arg2);
    } else if ((typeof arg1 === "object" || typeof arg1 === "number") && typeof arg2 === "string") {
      // find(OwnedEntity(123), "Weapon") 或 find(123, "Weapon")
      return findByOwner(arg1, arg2);
    } else if (typeof arg1 === "object" && arg2 instanceof LinkQuery) {
      // find(data, link("weapon")) 模式
      return findLink(arg1, arg2.linkName);
    }
  } else if (args.length === 3) {
    const [arg1, arg2, arg3] = args;
    
    if ((typeof arg1 === "object" || typeof arg1 === "number") && 
        typeof arg2 === "string" && 
        arg3 instanceof LinkQuery) {
      // find(owner, "path", link("linkName")) 模式
      const data = findByOwner(arg1, arg2);
      return data ? findLink(data, arg3.linkName) : undefined;
    } else if (arg1 instanceof handleQueryMode && 
               typeof arg2 === "string" && 
               arg3 instanceof LinkQuery) {
      // find(all(), "path", link("linkName")) 模式
      const dataSet = handleQueryMode(arg1, arg2);
      return Array.isArray(dataSet) 
        ? dataSet.map(data => findLink(data, arg3.linkName)).filter(Boolean)
        : findLink(dataSet, arg3.linkName);
    }
  }
  
  print("Invalid find arguments");
  return undefined;
}

// 链接查询辅助类
class LinkQuery {
  constructor(public linkName: string) {}
}

export function link(linkName: string): LinkQuery {
  return new LinkQuery(linkName);
}

// 内部实现函数
function findAll(path: string): any[] {
  const group = container[path];
  return group ? Object.values(group) : [];
}

function findByOwner(owner: any, path: string): any | undefined {
  let ownerId: number;
  
  if (typeof owner === "number") {
    ownerId = owner;
  } else if (owner && owner.id !== undefined) {
    ownerId = owner.id;
  } else {
    print("Invalid owner specification");
    return undefined;
  }
  
  const group = container[path];
  return group ? group[ownerId] : undefined;
}

function findLink(data: any, linkName: string): any | any[] | undefined {
  if (!data || !data.links) return undefined;
  
  const linkRef = data.links[linkName];
  if (!linkRef) return undefined;
  
  // 解析引用
  return resolveRef(linkRef);
}

// 增强的引用解析函数
export function resolveRef(refObj: any): any | any[] | undefined {
  if (!refObj) return undefined;
  
  // 如果是路径引用 { path: string, id: number }
  if (refObj.path && refObj.id !== undefined) {
    return find(refObj.id, refObj.path);
  }
  
  // 如果是直接引用对象
  if (refObj.ownerType && refObj.id !== undefined) {
    return find(refObj.id, refObj.path);
  }
  
  // 如果是数组引用
  if (Array.isArray(refObj)) {
    return refObj.map(item => resolveRef(item)).filter(Boolean);
  }
  
  return refObj;
}


// ... 其他代码保持不变 ...

// 重置函数实现
export function reset(...args: any[]): void {
  // 处理不同重置模式
  if (args.length === 0) {
    // reset() - 重置所有数据
    resetAll();
  } else if (args.length === 1) {
    if (typeof args[0] === "string") {
      // reset("Player.health") - 重置特定字段
      resetField(args[0]);
    } else if (Array.isArray(args[0])) {
      // reset(["Player.health", "Weapon.damage"]) - 重置多个字段
      args[0].forEach(resetField);
    } else if (args[0]?.path && args[0]?.id !== undefined) {
      // reset(OwnedEntity(123)) - 重置特定所有者所有路径
      resetOwner(args[0]);
    }
  } else if (args.length === 2) {
    if (typeof args[0] === "string" && typeof args[1] === "string") {
      // reset("Player", "health") - 重置特定路径的字段
      resetField(`${args[0]}.${args[1]}`);
    } else if (typeof args[0] === "string" && 
              (typeof args[1] === "object" || typeof args[1] === "number")) {
      // reset("Player", OwnedPlayer(1)) - 重置特定路径和所有者的所有字段
      resetOwnerPath(args[0], args[1]);
    } else if (args[0]?.path && args[0]?.id !== undefined && typeof args[1] === "string") {
      // reset(OwnedEntity(123), "Player.health") - 重置特定所有者的字段
      resetOwnerField(args[0], args[1]);
    }
  }
}

// 内部重置函数
function resetAll(): void {
  for (const path in container) {
    for (const id in container[path]) {
      resetEntry(container[path][id]);
    }
  }
}

function resetField(pathStr: string): void {
  const [path, field] = pathStr.split(".");
  const group = container[path];
  if (!group) return;

  for (const id in group) {
    const entry = group[id];
    if (entry.meta_fields?.[field]) {
      const meta = entry.meta_fields[field];
      entry.fields[field] = meta.reset;
      meta.value = meta.reset;
    }
  }
}

function resetOwner(owner: any): void {
  const ownerId = getOwnerId(owner);
  if (ownerId === undefined) return;

  for (const path in container) {
    const entry = container[path][ownerId];
    if (entry) {
      resetEntry(entry);
    }
  }
}

function resetOwnerPath(path: string, owner: any): void {
  const ownerId = getOwnerId(owner);
  if (ownerId === undefined) return;
  
  const entry = container[path]?.[ownerId];
  if (entry) {
    resetEntry(entry);
  }
}

function resetOwnerField(owner: any, pathStr: string): void {
  const [path, field] = pathStr.split(".");
  const ownerId = getOwnerId(owner);
  if (ownerId === undefined) return;
  
  const entry = container[path]?.[ownerId];
  if (entry?.meta_fields?.[field]) {
    const meta = entry.meta_fields[field];
    entry.fields[field] = meta.reset;
    meta.value = meta.reset;
  }
}

function resetEntry(entry: any): void {
  if (!entry.meta_fields) return;
  
  for (const field in entry.meta_fields) {
    const meta = entry.meta_fields[field];
    entry.fields[field] = meta.reset;
    meta.value = meta.reset;
  }
}

function getOwnerId(owner: any): number | undefined {
  if (typeof owner === "number") {
    return owner;
  } else if (owner?.id !== undefined) {
    return owner.id;
  }
  print("Invalid owner specification");
  return undefined;
}

