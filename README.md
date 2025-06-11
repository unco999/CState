# 🌄 Dota 2 Scene Snapshot System

一个为国风游戏开发而设计的 **Dota 2 场景快照系统**，支持**完整状态序列化与还原**。  
该工具可记录并恢复某一时间点的游戏状态，包括单位、技能、Modifier 等，便于进行状态测试和数据切片。

---

## ✨ 功能特色

- ✅ 支持完整保存/加载游戏场景状态
- ✅ 保存单位状态、技能状态、Modifier 状态
- ✅ 支持自定义扩展接口（如特定字段快照）
- ✅ 使用 TypeScript 编写，便于与 Dota 2 官方工具链集成

---

## 🐞 已知问题

- ❗ **第一次载入不稳定**：由于命石系统机制尚不完善，首次 `load` 可能失败，建议多载入几次。
- ❗ **Modifier 状态还原不完全**：某些单位上的 Modifier 无法完全恢复。

---

## 📌 使用场景

> 本工具用于我的国风题材游戏项目中，作为游戏状态的快照测试工具。

你可以通过扩展接口注册 `onCapture/onRestore` 方法，来实现自定义字段的保存与恢复。  
示例中保存了建筑物的无敌次数字段 `InvulnCount`。

---

## 🛠 示例代码

```ts
export function SnapshotExtensionTemplate() {
    EntitySnapshotExtensionManager.register({
        "onCapture": (ent, data) => {
            if (!ent.IsInstance(CDOTA_BaseNPC_Building)) return;
            data["InvulnCount"] = ent.GetInvulnCount();
        },
        "onRestore": (ent, data) => {
            if (!ent.IsInstance(CDOTA_BaseNPC_Building)) return;
            ent.SetInvulnCount(data["InvulnCount"]);
            print("设置了建筑的无敌次数");
        }
    });
}

▶️ 可用命令
save
保存当前场景快照（单位、技能、Modifier 状态）。

📦 建议用法
你可以将上述命令与测试流程结合，完成以下用途：

快速搭建测试战局（通过 botfull 命令）

捕捉某一时间点场景状态（通过 save 命令）

在状态变更后还原（通过 load 命令）

添加特定单位用于单元测试（通过 bot 命令）

# 🧪 调试命令说明

用于调试和测试的常用命令，可用于保存/加载场景、添加 BOT 等操作。

---

## 📦 可用命令

### 🔹 `start`
load 会冻结所有单位 需要解除modifier

### 🔹 `save`
保存当前场景快照，包括单位、技能、Modifier 等完整状态。

---

### 🔹 `load`
从快照中恢复场景状态，将场景重置为保存时的状态。

---

### 🔹 `bot <heroname> <lane>`
添加一名敌方 BOT 英雄并指定线路。  
示例：`bot npc_dota_hero_axe mid`

---

### 🔹 `botfull`
快速添加一整队敌我双方 BOT 英雄（5v5），常用于快速构建测试战局。

---

## ✅ 推荐使用方式

- 使用 `botfull` 快速搭建一局测试战斗
- 使用 `save` 捕捉某一时间点的完整状态
- 使用 `load` 还原保存的状态进行回溯测试
- 使用 `bot` 添加特定单位进行单元测试

