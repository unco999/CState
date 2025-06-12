import { LoadSnap, SnapshotExtensionTempalte, SaveGameState, AddOneBot } from '../cryso/snapshot';
import { test } from '../cryso/structs';
import { EntityFilter } from '../cryso/white_list';

import { reloadable } from '../utils/tstl-utils';
import type { EasingFunctionName } from '../utils/tween';
import { tween } from '../utils/tween';
import cryso from '../cryso';

type DebugCallbackFunction = (hero: CDOTA_BaseNPC_Hero, ...args: string[]) => void;

/** 所有的测试指令的回调 */
const DebugCallbacks: Record<string, { desc: string; func: DebugCallbackFunction }> = {
    ['-help']: {
        desc: '显示所有的测试指令',
        func: () => {
            print('所有的测试指令:');
            for (const [cmd, { desc }] of Object.entries(DebugCallbacks)) {
                print(`${cmd}: ${desc}`);
            }
        },
    },
    ['-s']: {
        desc: '重载脚本',
        func: () => {
            SendToConsole('script_reload');
            print('-r 命令script_reload!重载脚本!');
        },
    },
    ['-r']: {
        desc: '重启游戏',
        func: () => {
            SendToConsole('restart'); // 重启游戏
            print('-r 命令restart重启游戏!');
        },
    },
    ['get_key_v3']: {
        desc: '获取v3版本的key',
        func: (hero, ...args: string[]) => {
            const version = args[0];
            const key = GetDedicatedServerKeyV3(version);
            Say(hero, `${version}: ${key}`, true);
        },
    },
    ['get_key_v2']: {
        desc: '获取v2版本的key， get_key_v2 version',
        func: (hero, ...args: string[]) => {
            const version = args[0];
            const key = GetDedicatedServerKeyV2(version);
            Say(hero, `${version}: ${key}`, true);
        },
    },
    ['-tween']: {
        desc: '测试Tween',
        func: (hero, ...args: string[]) => {
            FindClearSpaceForUnit(hero, hero.GetAbsOrigin(), true);
            const source = { scale: 1 };
            const target = { scale: 3 };
            const duration = 0.3;
            const funcName = args[0];
            const myTween = tween(duration, source, target, funcName as EasingFunctionName);
            let now = GameRules.GetGameTime();
            Timers.CreateTimer(() => {
                const dt = GameRules.GetGameTime() - now;
                now = GameRules.GetGameTime();
                const finished = myTween.update(dt);
                if (finished) {
                    return null;
                } else {
                    print(source.scale);
                    hero.SetModelScale(source.scale);
                    return 0.03;
                }
            });
        },
    },
};

@reloadable
export class Debug {
    DebugEnabled = false;
    private _chatListener: EventListenerID;

    // 在线测试白名单
    OnlineDebugWhiteList = [
        86815341, // Xavier
    ];

    constructor() {
        // 工具模式下开启调试
        if (IsInToolsMode()) {
            this._toggleDebugMode(true);
        }
        this._chatListener = ListenToGameEvent(`player_chat`, keys => this.OnPlayerChat(keys), this);
    }

    private _toggleDebugMode(on?: boolean) {
        if (on === undefined) {
            this.DebugEnabled = !this.DebugEnabled;
        } else {
            this.DebugEnabled = on;
        }
        if (this.DebugEnabled) {
            print('Debug mode enabled!');
        } else {
            print('Debug mode disabled!');
        }
    }

    OnPlayerChat(keys: GameEventProvidedProperties & PlayerChatEvent): void {
        const strs = keys.text.split(' ');
        const cmd = strs[0];
        const args = strs.slice(1);
        const steamid = PlayerResource.GetSteamAccountID(keys.playerid);

        if (cmd === '-debug') {
            if (this.OnlineDebugWhiteList.includes(steamid)) {
                this._toggleDebugMode();
            }
        }

        // 只在允许调试的时候才执行以下指令
        // commands that only work in debug mode below:
        if (!this.DebugEnabled) return;

        const hero = HeroList.GetHero(0);

        if (DebugCallbacks[cmd]) {
            DebugCallbacks[cmd].func(hero, ...args);
        }

        if(cmd == "load"){
            cryso.LoadCryso()

        }

        if(cmd == "save"){
            cryso.SaveCryso()
        }

        if(cmd == "bot"){
            if(args[0] == null || args[1] == null){
                print("格式不对 格式为 'bot heroname lane' ")
                return
            }
            AddOneBot(DotaTeam.BADGUYS,args[0],args[1])
        }

        if(cmd == "botfull"){
            AddOneBot(DotaTeam.BADGUYS,"npc_dota_hero_axe","mid")
            AddOneBot(DotaTeam.BADGUYS,"npc_dota_hero_beastmaster","mid")
            AddOneBot(DotaTeam.BADGUYS,"npc_dota_hero_brewmaster","mid")
            AddOneBot(DotaTeam.BADGUYS,"npc_dota_hero_bristleback","mid")

            AddOneBot(DotaTeam.GOODGUYS,"npc_dota_hero_zuus","mid")
            AddOneBot(DotaTeam.GOODGUYS,"npc_dota_hero_beastmaster","mid")
            AddOneBot(DotaTeam.GOODGUYS,"npc_dota_hero_witch_doctor","mid")
            AddOneBot(DotaTeam.GOODGUYS,"npc_dota_hero_winter_wyvern","mid")
        }

        if(cmd == "start"){
            Entities.FindAllByClassname("*")
                    .filter(EntityFilter)
                    .forEach(elm=>{
                        if(elm.IsBaseNPC()){
                            elm.RemoveModifierByName("modifier_free")
                        }
                    })
        }


        if(cmd == 'reload'){
            
        }

        if(cmd == "test"){
            test()
        }
    }
}
