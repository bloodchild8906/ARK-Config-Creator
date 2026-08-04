/* =========================================================================
   ARK ASA Config Creator — bundled CurseForge mod catalog.
   Auto-generated from live CurseForge data (via api.cfwidget.com) on the date
   below. Metadata (IDs, names, downloads, thumbnails) verified against the
   live API; INI settings extracted from each mod's own CurseForge page.
   Entry format:
     id      = CurseForge numeric project ID (what goes in -mods=)
     slug    = curseforge.com/ark-survival-ascended/mods/<slug>
     cat     = qol | structures | dinos | maps | stacking | utility | overhaul | admin | cosmetics | other
     mapName = for map mods: the map name used in the start command
     src     = where the INI settings are documented
     ini     = [{ file:'gus'|'game', section:'Name', settings:[{k,t,d,n,h}] }]
               t: bool|int|float|str; d: default (null = not documented)
   ========================================================================= */

const MODS_DB_DATE = '2026-07-18';
const MODS_DB = [
 {
  "id": 940975,
  "slug": "cybers-structures",
  "name": "Cybers Structures QoL+ (Crossplay)",
  "sum": "Adding support for some Quality of Life to structures and other essential items",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1866/964/256/256/639171341039507508.png",
  "dl": 26350979,
  "author": "CyberAngel",
  "cat": "structures",
  "mapName": "",
  "ini": []
 },
 {
  "id": 928793,
  "slug": "cryopods",
  "name": "Pelayori's Cryo Storage (Crossplay!)",
  "sum": "Cryopods for Dino Storage , cryogun, cryo terminal, neuter gun, all stats fixed, and much more! Works with buffs like Shiny!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/972/618/256/256/638474922382511261.png",
  "dl": 13699950,
  "author": "pelayori",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 929420,
  "slug": "super-spyglass-plus",
  "name": "Super Spyglass Plus",
  "sum": "Adds an Spyglass that shows advanced information about most stuff you point it at.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/904/667/256/256/638355047673327098.png",
  "dl": 13457015,
  "author": "kavan87",
  "cat": "qol",
  "mapName": "",
  "ini": [
   {
    "section": "SuperSpyglassPlus",
    "settings": [
     {
      "k": "DisableNightVision",
      "t": "bool",
      "d": false,
      "n": "Disable Night Vision",
      "h": "ON = removes the spyglass night-vision mode."
     },
     {
      "k": "DisablePredatorVision",
      "t": "bool",
      "d": false,
      "n": "Disable Predator Vision",
      "h": ""
     },
     {
      "k": "DisableOutlineMode",
      "t": "bool",
      "d": false,
      "n": "Disable Outline Mode",
      "h": ""
     },
     {
      "k": "DisableSupplyDropInfo",
      "t": "bool",
      "d": false,
      "n": "Disable Supply Drop Info",
      "h": ""
     },
     {
      "k": "DisableItembagInfo",
      "t": "bool",
      "d": false,
      "n": "Disable Itembag Info",
      "h": ""
     },
     {
      "k": "DisableStructureInfo",
      "t": "bool",
      "d": false,
      "n": "Disable Structure Info",
      "h": ""
     },
     {
      "k": "DisableBuffInfo",
      "t": "bool",
      "d": false,
      "n": "Disable Buff Info",
      "h": ""
     },
     {
      "k": "DisableTameFoodInfo",
      "t": "bool",
      "d": false,
      "n": "Disable Tame Food Info",
      "h": ""
     },
     {
      "k": "DisableEggInfo",
      "t": "bool",
      "d": false,
      "n": "Disable Egg Info",
      "h": ""
     },
     {
      "k": "DisableTheSpyglassOnEnemyTribes",
      "t": "bool",
      "d": false,
      "n": "Disable The Spyglass On Enemy Tribes",
      "h": ""
     },
     {
      "k": "OnlyShowStatsForTames",
      "t": "bool",
      "d": false,
      "n": "Only Show Stats For Tames",
      "h": ""
     },
     {
      "k": "DisableGPS",
      "t": "bool",
      "d": false,
      "n": "Disable GPS",
      "h": "ON = removes the GPS coordinates display."
     },
     {
      "k": "DisableCrosshair",
      "t": "bool",
      "d": false,
      "n": "Disable Crosshair",
      "h": "ON = removes the spyglass crosshair."
     },
     {
      "k": "OnlyHPonEnemyTribeDinos",
      "t": "bool",
      "d": false,
      "n": "Only H Pon Enemy Tribe Dinos",
      "h": "If set to true will only show the HP Bar on Enemy Tribe Creatures."
     },
     {
      "k": "OutlineRange",
      "t": "int",
      "d": 15000,
      "n": "Outline Range",
      "h": "How far (in game units) the outline highlight reaches."
     },
     {
      "k": "UseESPOutline",
      "t": "bool",
      "d": false,
      "n": "Use ESP Outline",
      "h": ""
     },
     {
      "k": "UseESPOutlineFill",
      "t": "bool",
      "d": false,
      "n": "Use ESP Outline Fill",
      "h": ""
     },
     {
      "k": "DontShowAnyStatsOnWildDino",
      "t": "bool",
      "d": false,
      "n": "Dont Show Any Stats On Wild Dino",
      "h": ""
     },
     {
      "k": "DisableGeneTraitInfo",
      "t": "bool",
      "d": false,
      "n": "Disable Gene Trait Info",
      "h": ""
     },
     {
      "k": "DisableStatCompare",
      "t": "bool",
      "d": false,
      "n": "Disable Stat Compare",
      "h": ""
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/super-spyglass-plus"
 },
 {
  "id": 928597,
  "slug": "automated-ark",
  "name": "Automated Ark",
  "sum": "Automated Ark is made to take some of the more mundane tasks in Ark and make them enjoyable so you can jump straight into the fun stuff. Automated Ark",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/895/880/256/256/638340875221384467.png",
  "dl": 9344826,
  "author": "blitzfire911",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 947033,
  "slug": "awesomespyglass",
  "name": "Awesome  Spyglass!",
  "sum": "Like a regular SpyGlass, except Awesomer!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/915/889/256/256/638374185412464094.octet-stream",
  "dl": 9328524,
  "author": "ChrisMods",
  "cat": "qol",
  "mapName": "",
  "ini": []
 },
 {
  "id": 935408,
  "slug": "der-dino-finder",
  "name": "Der Dino Finder",
  "sum": "Adds a button to the minimap with which you can find dinos.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/903/512/256/256/638352944065725913.png",
  "dl": 8292260,
  "author": "Hacki_van_Bane",
  "cat": "qol",
  "mapName": "",
  "ini": []
 },
 {
  "id": 929110,
  "slug": "tg-stacking-mod-10000-90",
  "name": "TG Stacking Mod 10000-90",
  "sum": "10.000 Stacks / -90% Weight",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/896/747/256/256/638341857132402240.png",
  "dl": 7582329,
  "author": "Paeaet",
  "cat": "stacking",
  "mapName": "",
  "ini": []
 },
 {
  "id": 928501,
  "slug": "solo-farm-mod",
  "name": "Solo Farm Mod",
  "sum": "This mod helps you Farm Solo",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/904/605/256/256/638354964349458497.jpeg",
  "dl": 7424874,
  "author": "kavan87",
  "cat": "utility",
  "mapName": "",
  "ini": [
   {
    "section": "SFM",
    "settings": [
     {
      "k": "DisableExtraWeightReduction",
      "t": "bool",
      "d": null,
      "n": "Disable Extra Weight Reduction",
      "h": "True or False, Default is False."
     },
     {
      "k": "AnkyAndDoediNormalAttack",
      "t": "bool",
      "d": null,
      "n": "Anky And Doedi Normal Attack",
      "h": "True or False, Default is False."
     },
     {
      "k": "RespectWeightLimit",
      "t": "bool",
      "d": false,
      "n": "Respect Weight Limit",
      "h": "If true dinos will stop attacking when they reach there max weight in Farmmode."
     },
     {
      "k": "UseStaminaInFarmMode",
      "t": "bool",
      "d": false,
      "n": "Use Stamina In Farm Mode",
      "h": "If true creatures in farmmode will use stamina."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/solo-farm-mod"
 },
 {
  "id": 933099,
  "slug": "super-cryo-storage",
  "name": "Super Cryo Storage",
  "sum": "The perfect way to store your dinos! Store the dinos faster and deploy so much faster",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/993/671/256/256/638508643683649213.png",
  "dl": 7414598,
  "author": "brunoamaraltm",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 931874,
  "slug": "arkitect-structures-remastered",
  "name": "Arkitect Structures Remastered",
  "sum": "A cross-platform remake of my Ark Survival Evolved structure mod, Arkitect Structures: Core.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1085/487/256/256/638627062079853509.jpeg",
  "dl": 7007893,
  "author": "Gimilkhad",
  "cat": "structures",
  "mapName": "",
  "ini": []
 },
 {
  "id": 928708,
  "slug": "custom-dino-levels",
  "name": "Custom Dino Levels",
  "sum": "Level distribution mod. ",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/895/998/256/256/638341001824710728.png",
  "dl": 6931347,
  "author": "kitzykatty",
  "cat": "utility",
  "mapName": "",
  "ini": [
   {
    "section": "CustomLevelDistrib",
    "settings": [
     {
      "k": "MinLevel",
      "t": "float",
      "d": 1.0,
      "n": "Min Level",
      "h": "Lowest wild dino level (in level \"steps\" — 1 step = 5 levels at difficulty 5)."
     },
     {
      "k": "MaxLevel",
      "t": "float",
      "d": 30.0,
      "n": "Max Level",
      "h": "Highest wild dino level (in level \"steps\" — 30 steps = level 150 at difficulty 5)."
     },
     {
      "k": "MaxDrakeLevel",
      "t": "float",
      "d": 38.0,
      "n": "Max Drake Level",
      "h": "Highest level step for Rock Drakes."
     },
     {
      "k": "MinDrakeLevel",
      "t": "float",
      "d": 1.0,
      "n": "Min Drake Level",
      "h": "Lowest level step for Rock Drakes."
     },
     {
      "k": "MinDeinonLevel",
      "t": "float",
      "d": 1.0,
      "n": "Min Deinon Level",
      "h": "Lowest level step for Deinonychus."
     },
     {
      "k": "MaxDeinonLevel",
      "t": "float",
      "d": 30.0,
      "n": "Max Deinon Level",
      "h": "Highest level step for Deinonychus."
     },
     {
      "k": "MinMagmaLevel",
      "t": "float",
      "d": 1.0,
      "n": "Min Magma Level",
      "h": "Lowest level step for Magmasaurs."
     },
     {
      "k": "MaxMagmaLevel",
      "t": "float",
      "d": 30.0,
      "n": "Max Magma Level",
      "h": "Highest level step for Magmasaurs."
     },
     {
      "k": "WantsEqualLevels",
      "t": "bool",
      "d": true,
      "n": "Wants Equal Levels",
      "h": "ON = every level has the same spawn chance (flat distribution)."
     },
     {
      "k": "PreventBee",
      "t": "bool",
      "d": true,
      "n": "Prevent Bee",
      "h": "ON = level rules do not apply to bees."
     },
     {
      "k": "PreventTitan",
      "t": "bool",
      "d": true,
      "n": "Prevent Titan",
      "h": "ON = level rules do not apply to titans."
     },
     {
      "k": "WantsCustom",
      "t": "bool",
      "d": false,
      "n": "Wants Custom",
      "h": "ON = use the custom weight settings below."
     },
     {
      "k": "WantsRagLevels",
      "t": "bool",
      "d": false,
      "n": "Wants Rag Levels",
      "h": "ON = use Ragnarok-style higher level distribution."
     },
     {
      "k": "WantsHighLevels",
      "t": "bool",
      "d": false,
      "n": "Wants High Levels",
      "h": "ON = strongly favor high-level spawns."
     },
     {
      "k": "TinyWeight",
      "t": "float",
      "d": 1.0,
      "n": "Tiny Weight",
      "h": "Custom mode: spawn weight for the lowest level band."
     },
     {
      "k": "LowWeight",
      "t": "float",
      "d": 0.5,
      "n": "Low Weight",
      "h": "Custom mode: spawn weight for low levels."
     },
     {
      "k": "MediumWeight",
      "t": "float",
      "d": 0.25,
      "n": "Medium Weight",
      "h": "Custom mode: spawn weight for medium levels."
     },
     {
      "k": "HighWeight",
      "t": "float",
      "d": 0.1,
      "n": "High Weight",
      "h": "Custom mode: spawn weight for high levels."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/custom-dino-levels"
 },
 {
  "id": 928621,
  "slug": "utilities-plus",
  "name": "Utilities Plus",
  "sum": "Reusable Tools made Simple.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/895/909/256/256/638340903071594984.png",
  "dl": 6915766,
  "author": "blitzfire911",
  "cat": "qol",
  "mapName": "",
  "ini": []
 },
 {
  "id": 942024,
  "slug": "dino-depot",
  "name": "Dino Depot",
  "sum": "Dino and creature storage done right. Crossplay enabled. \"Not a cryopod cryo mod\".  The best cryos storage mod available with over 200 config options!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/910/158/256/256/638363777480918040.png",
  "dl": 6068918,
  "author": "DelilahEve",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 930494,
  "slug": "upgrade-station",
  "name": "Upgrade Station",
  "sum": "Upgrade Station",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/919/398/256/256/638381602612302436.png",
  "dl": 6034435,
  "author": "Ghazlawl",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 950914,
  "slug": "awesometeleporters",
  "name": "Awesome Teleporters!",
  "sum": "Teleporters that are Awesome!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/920/315/256/256/638383589731796125.png",
  "dl": 4324111,
  "author": "ChrisMods",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 1179719,
  "slug": "castle-craft-structure-skins",
  "name": "Castle Craft Structure Skins",
  "sum": "Medieval Structure Skin Mod ",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1157/581/256/256/638725650954287423.png",
  "dl": 4231664,
  "author": "aaronlongstaff",
  "cat": "cosmetics",
  "mapName": "",
  "ini": []
 },
 {
  "id": 932714,
  "slug": "ark-primal-chaos",
  "name": "Ark Primal Chaos",
  "sum": "Full Overhaul mod",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/900/95/256/256/638346421942194935.png",
  "dl": 4115783,
  "author": "MrChaos",
  "cat": "overhaul",
  "mapName": "",
  "ini": []
 },
 {
  "id": 953154,
  "slug": "auto-engrams",
  "name": "Auto Engrams!",
  "sum": "Auto unlocks Engrams as you reach the required level",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/922/868/256/256/638388822972370605.png",
  "dl": 4033942,
  "author": "ChrisMods",
  "cat": "qol",
  "mapName": "",
  "ini": [
   {
    "section": "AutoEngrams",
    "settings": [
     {
      "k": "ForceUnlockLevel",
      "t": "int",
      "d": 0,
      "n": "Force Unlock Level",
      "h": "The default value 0 is disabled."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/auto-engrams"
 },
 {
  "id": 936660,
  "slug": "resonants-shop-mod",
  "name": "Resonant's Shop Mod",
  "sum": "This mod will allow server Admins to create in game packages consisting of dinos and items that players can purchase for in game points.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/904/194/256/256/638354160422169164.png",
  "dl": 3714663,
  "author": "Resonant",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 941450,
  "slug": "awesome-admin-tools",
  "name": "Awesome ARK Tools",
  "sum": "Awesome ark tools with many fun and useful admin and non-admin features",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/909/463/256/256/638362602649322345.png",
  "dl": 3641720,
  "author": "BenzomineraMods",
  "cat": "admin",
  "mapName": "",
  "ini": []
 },
 {
  "id": 929578,
  "slug": "ap-death-recovery",
  "name": "AP: Death Recovery [Cross-platform]",
  "sum": "A simple cross-platform mod that adds a structure that recovers your items upon death!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/896/977/256/256/638342058181975261.png",
  "dl": 3552994,
  "author": "elkay",
  "cat": "qol",
  "mapName": "",
  "ini": []
 },
 {
  "id": 929800,
  "slug": "tg-stacking-mod-1000-50",
  "name": "TG Stacking Mod 1000-50",
  "sum": "1.000 Stacks / -50% Weight",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/897/151/256/256/638342208459426935.png",
  "dl": 2979936,
  "author": "Paeaet",
  "cat": "stacking",
  "mapName": "",
  "ini": []
 },
 {
  "id": 877752,
  "slug": "fear-ascended",
  "name": "Fear Ascended",
  "sum": "Fear Ascended Event Mod",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1107/497/256/256/638657481252896538.png",
  "dl": 2448495,
  "author": "StudioWildcardMods",
  "cat": "other",
  "mapName": "",
  "ini": []
 },
 {
  "id": 952367,
  "slug": "ark-descended",
  "name": "Ark Descended",
  "sum": "A Creature Rebalanced Mod Made By EmptyDream",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/933/961/256/256/638409762999360505.png",
  "dl": 2097324,
  "author": "EmptyDream233",
  "cat": "overhaul",
  "mapName": "",
  "ini": [
   {
    "section": "ArkDescended",
    "settings": [
     {
      "k": "PickHarvestRate",
      "t": "int",
      "d": 5,
      "n": "Pick Harvest Rate",
      "h": "Int 1-5."
     },
     {
      "k": "HatchetHarvestRate",
      "t": "int",
      "d": 5,
      "n": "Hatchet Harvest Rate",
      "h": "Int 1- 5."
     },
     {
      "k": "RocketSingularity",
      "t": "bool",
      "d": true,
      "n": "Rocket Singularity",
      "h": "Enable singularity rockets? Default: True (set False to avoid crashes)."
     },
     {
      "k": "DragonSingularity",
      "t": "bool",
      "d": false,
      "n": "Dragon Singularity",
      "h": "Dragon singularity attack (risk: server crash!). Default: False."
     },
     {
      "k": "BossBattleMusic",
      "t": "bool",
      "d": false,
      "n": "Boss Battle Music",
      "h": "Toggle boss music."
     },
     {
      "k": "EternalSwordInfiniteHealth",
      "t": "bool",
      "d": true,
      "n": "Eternal Sword Infinite Health",
      "h": "Infinite health for Player. Default: True."
     },
     {
      "k": "LootBoxQuantity",
      "t": "int",
      "d": 1,
      "n": "Loot Box Quantity",
      "h": "Integer. Number of loot boxes. Default: 1."
     },
     {
      "k": "WarGenUnbreakable",
      "t": "bool",
      "d": true,
      "n": "War Gen Unbreakable",
      "h": "Make War Generators indestructible. Default: True."
     },
     {
      "k": "TekShieldHealthMulti",
      "t": "int",
      "d": 1,
      "n": "Tek Shield Health Multi",
      "h": "Adjust Tek Shield health. 1-10."
     },
     {
      "k": "LARexGravityRoar",
      "t": "bool",
      "d": false,
      "n": "LA Rex Gravity Roar",
      "h": "Enable gravity roar for Legendary Rex. Default: False."
     },
     {
      "k": "EnableUltimateMinions",
      "t": "bool",
      "d": true,
      "n": "Enable Ultimate Minions",
      "h": "Toggle Tier 8 Carcha minion spawns. Default: True."
     },
     {
      "k": "AllowTier8SPlusBreed",
      "t": "bool",
      "d": false,
      "n": "Allow Tier8 S Plus Breed",
      "h": "Allow S+ structures to breed Tier 8 creatures. Default: False."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/ark-descended"
 },
 {
  "id": 936457,
  "slug": "admin-commands",
  "name": "Admin Commands | Gaia Studios",
  "sum": "Control server commands using a tailored UI activated through an admin-only consumable.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1086/740/256/256/638629013651848612.jpeg",
  "dl": 1476441,
  "author": "GaiaStudios",
  "cat": "admin",
  "mapName": "",
  "ini": []
 },
 {
  "id": 1149214,
  "slug": "ckf-castles-keeps-forts",
  "name": "Castles, Keeps, and Forts - CKF",
  "sum": "593 Medieval structures across 3 expanded structure tiers.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1176/250/256/256/638748700680227496.jpeg",
  "dl": 1227212,
  "author": "ExileAcid",
  "cat": "structures",
  "mapName": "",
  "ini": []
 },
 {
  "id": 948965,
  "slug": "simpletrade",
  "name": "Simple Trade",
  "sum": "A mod that allows players to trade items by creating offers in a Trade Table. Others can buy these for Simple Coins as currency. *Shop",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1464/840/256/256/638950935177877193.png",
  "dl": 1065820,
  "author": "Segradeth",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 988598,
  "slug": "astraeos-greek-themed-map",
  "name": "Astraeos",
  "sum": "Astraeos is a greek fantasy map",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1050/464/256/256/638579777888199834.jpeg",
  "dl": 1021657,
  "author": "Nekatus_Modding",
  "cat": "maps",
  "mapName": "Astraeos_WP",
  "ini": []
 },
 {
  "id": 965379,
  "slug": "amissa",
  "name": "Amissa",
  "sum": "Beautiful fantasy map with a past civilization which was fighting back the tek.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1784/6/256/256/639131612529727529.jpeg",
  "dl": 843770,
  "author": "sicco0803",
  "cat": "maps",
  "mapName": "Amissa_WP",
  "ini": []
 },
 {
  "id": 966562,
  "slug": "rr-medieval-structures",
  "name": "RR-Medieval Structures",
  "sum": "Medieval Structure Mod",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/942/394/256/256/638424737490022428.png",
  "dl": 766932,
  "author": "Naneya",
  "cat": "structures",
  "mapName": "",
  "ini": []
 },
 {
  "id": 893657,
  "slug": "svartalfheim",
  "name": "Svartalfheim Testversion [PC Only]",
  "sum": "A dwarven inspired ARK: Survival Ascended modded map",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/893/105/256/256/638335834992381269.jpeg",
  "dl": 751967,
  "author": "Nekatus_Modding",
  "cat": "maps",
  "mapName": "Svartalfheim_WP",
  "ini": []
 },
 {
  "id": 940003,
  "slug": "super-structures-ascended",
  "name": "Super Structures Ascended",
  "sum": "Comprehensive Building and QoL overhaul.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/936/770/256/256/638414479511924593.png",
  "dl": 700800,
  "author": "Legendarsreign",
  "cat": "structures",
  "mapName": "",
  "ini": []
 },
 {
  "id": 1056780,
  "slug": "lacc",
  "name": "LACC: Lily and Azure's Cluster Chat",
  "sum": "*Lacc-ing* a real-time cluster chat? look no further!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1033/774/256/256/638557324780199245.png",
  "dl": 657820,
  "author": "Azuremoon13",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 943030,
  "slug": "anunnaki-genesis-ascended",
  "name": "Anunnaki Genesis: Ascended",
  "sum": "Revival attempt for a famous mod from Annunaki Genesis by Psycho, I do not take creditability of his work as I am continuing his legacy. ",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1806/94/256/256/639142851842365338.png",
  "dl": 610214,
  "author": "DaRealMaffle",
  "cat": "overhaul",
  "mapName": "",
  "ini": []
 },
 {
  "id": 1009169,
  "slug": "forglar-premium",
  "name": "Forglar Part I (MAP)",
  "sum": "Forglar mod map ( Premium Version )",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1800/888/256/256/639140096367658452.png",
  "dl": 574563,
  "author": "SnowyTrain",
  "cat": "maps",
  "mapName": "Forglar_WP",
  "ini": []
 },
 {
  "id": 932943,
  "slug": "kavans-shop-missions",
  "name": "Kavan's Shop & Missions",
  "sum": "This mod offers a Shop , Missions and the possiblity to crate Missions and almost everything is configurable.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/900/52/256/256/638346350110467501.png",
  "dl": 568683,
  "author": "kavan87",
  "cat": "utility",
  "mapName": "",
  "ini": [
   {
    "section": "Ksm",
    "settings": [
     {
      "k": "Goldcoinsovertime",
      "t": "int",
      "d": null,
      "n": "Goldcoinsovertime",
      "h": "The amount of Goldcoins players get every 30 min."
     },
     {
      "k": "DisableMissions",
      "t": "bool",
      "d": null,
      "n": "Disable Missions",
      "h": "True or false if true will disable missions."
     },
     {
      "k": "BuffIconColor",
      "t": "str",
      "d": null,
      "n": "Buff Icon Color",
      "h": "0 Green, 1 Light Blue, 2 Dark Blue, 3 Orange, 4 Red, 5 Yellow, 6 Pink, 7 Turquoise, 8 will hide the buff icon."
     },
     {
      "k": "UseCustomWelcomeScreen",
      "t": "bool",
      "d": null,
      "n": "Use Custom Welcome Screen",
      "h": "True or False."
     },
     {
      "k": "WelcomeHeader",
      "t": "str",
      "d": null,
      "n": "Welcome Header",
      "h": "Put the header for the welcome message here."
     },
     {
      "k": "WelcomeMessage",
      "t": "str",
      "d": null,
      "n": "Welcome Message",
      "h": "Put your welcome message here."
     },
     {
      "k": "PVPGoldcoinGain",
      "t": "str",
      "d": null,
      "n": "PVP Goldcoin Gain",
      "h": "True enables that players will get a % of the Goldcoins of the players they kill."
     },
     {
      "k": "PVPGoldLossPercent",
      "t": "int",
      "d": null,
      "n": "PVP Gold Loss Percent",
      "h": "Whole numbers from 1 to 100, how much % of Gold is transferred after a kill."
     },
     {
      "k": "PVPDisableKillFeed",
      "t": "str",
      "d": null,
      "n": "PVP Disable Kill Feed",
      "h": "True disables the messages on players screens after pvp kills."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/kavans-shop-missions"
 },
 {
  "id": 941467,
  "slug": "auto-crop-plot",
  "name": "Auto Crop Plot | Gaia Studios",
  "sum": "Enjoy infinite water and fertilizer, automatic greenhouse effect, and 3x crop yield.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1086/744/256/256/638629017445062465.jpeg",
  "dl": 552362,
  "author": "GaiaStudios",
  "cat": "qol",
  "mapName": "",
  "ini": [
   {
    "section": "GaiaCropPlot",
    "settings": [
     {
      "k": "TilledMaximumCount",
      "t": "int",
      "d": 10,
      "n": "Tilled Maximum Count",
      "h": "How many times a crop plot can be tilled."
     },
     {
      "k": "TilledBonusYieldMultiplierAtOneTill",
      "t": "float",
      "d": 0.1,
      "n": "Tilled Bonus Yield Multiplier At One Till",
      "h": "0.1 = 10%."
     },
     {
      "k": "TilledBonusYieldMultiplierAtMaxTill",
      "t": "int",
      "d": 1,
      "n": "Tilled Bonus Yield Multiplier At Max Till",
      "h": "1 = 100%."
     },
     {
      "k": "TilledBonusGrowthRateMultiplierAtOneTill",
      "t": "float",
      "d": 0.1,
      "n": "Tilled Bonus Growth Rate Multiplier At One Till",
      "h": "0.1 = 10%."
     },
     {
      "k": "TilledBonusGrowthRateMultiplierAtMaxTill",
      "t": "int",
      "d": 1,
      "n": "Tilled Bonus Growth Rate Multiplier At Max Till",
      "h": "1 = 100%."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/auto-crop-plot"
 },
 {
  "id": 955451,
  "slug": "structure-management-tool",
  "name": "Structure Management Tools (Quick Stack, Pickup Structures, Transfer Inventory etc.)",
  "sum": "For managing personal and tribe structures and inventories depending on tribe permissions, e.g. pickup and transfer",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1101/972/256/256/638649867172407923.png",
  "dl": 498596,
  "author": "Eurymachus",
  "cat": "qol",
  "mapName": "",
  "ini": [
   {
    "section": "SMT",
    "settings": [
     {
      "k": "bModeEnabledPickup",
      "t": "bool",
      "d": true,
      "n": "Mode Enabled Pickup",
      "h": "Enables/Disables 'Pickup Structure' mode."
     },
     {
      "k": "bModeEnabledDemolish",
      "t": "bool",
      "d": true,
      "n": "Mode Enabled Demolish",
      "h": "Enables/Disables 'Demolish Structure' mode."
     },
     {
      "k": "bModeEnabledTransfer",
      "t": "bool",
      "d": true,
      "n": "Mode Enabled Transfer",
      "h": "Enables/Disables 'Transfer Inventory' mode."
     },
     {
      "k": "bModeEnabledRepair",
      "t": "bool",
      "d": true,
      "n": "Mode Enabled Repair",
      "h": "Enables/Disables 'Repair Structure' mode."
     },
     {
      "k": "bModeEnabledActivate",
      "t": "bool",
      "d": true,
      "n": "Mode Enabled Activate",
      "h": "Enables/Disables 'Activate Structure' mode."
     },
     {
      "k": "bModeEnabledRename",
      "t": "bool",
      "d": true,
      "n": "Mode Enabled Rename",
      "h": "Enables/Disables 'Rename Structure' mode."
     },
     {
      "k": "bQuickStackingEnabled",
      "t": "bool",
      "d": true,
      "n": "Quick Stacking Enabled",
      "h": "Enables/Disables 'Quick Stacking' feature."
     },
     {
      "k": "bQuickStackIncludesRidden",
      "t": "bool",
      "d": true,
      "n": "Quick Stack Includes Ridden",
      "h": "Enables/Disables Including Ridden Creatures with Quick Stacking."
     },
     {
      "k": "bQuickStackingToCreatureEnabled",
      "t": "bool",
      "d": true,
      "n": "Quick Stacking To Creature Enabled",
      "h": "Enables/Disables Quick Stack/Take To/From Creatures."
     },
     {
      "k": "QuickStackMaxDistance",
      "t": "float",
      "d": 400.0,
      "n": "Quick Stack Max Distance",
      "h": "Maximum distance at which you can send to an Inventory using Quick Stack."
     },
     {
      "k": "bAllowPickupDamagedStructure",
      "t": "bool",
      "d": true,
      "n": "Allow Pickup Damaged Structure",
      "h": "Allows the pickup of damaged structures."
     },
     {
      "k": "MaxTransferDistance",
      "t": "float",
      "d": 3000.0,
      "n": "Max Transfer Distance",
      "h": "Sets the maximum distance between transferring inventories."
     },
     {
      "k": "bOverrideRepairTimer",
      "t": "bool",
      "d": true,
      "n": "Override Repair Timer",
      "h": "Allows the repair structure mode to skip the 'recently damaged' check."
     },
     {
      "k": "bTransfersRespectWeight",
      "t": "bool",
      "d": true,
      "n": "Transfers Respect Weight",
      "h": "Enables/Disables respecting character weight when transferring."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/structure-management-tool"
 },
 {
  "id": 1020675,
  "slug": "hypers-offline-raid-protection",
  "name": "Hyper's Offline Raid Protection",
  "sum": "Offline raid protection with configurable shield and decay options.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/998/336/256/256/638516580756353328.png",
  "dl": 471962,
  "author": "TheRealHypernatrema",
  "cat": "utility",
  "mapName": "",
  "ini": [
   {
    "section": "HypersORP",
    "settings": [
     {
      "k": "OrpRadius",
      "t": "int",
      "d": null,
      "n": "Orp Radius",
      "h": "Range, 300 = 1 foundation."
     },
     {
      "k": "OrpActivationTimer",
      "t": "int",
      "d": null,
      "n": "Orp Activation Timer",
      "h": "In seconds, time after log off to enable ORP."
     },
     {
      "k": "OrpOfflineDamage",
      "t": "str",
      "d": null,
      "n": "Orp Offline Damage",
      "h": "Turret damage multiplier while offline."
     },
     {
      "k": "OrpStructuresHP",
      "t": "str",
      "d": null,
      "n": "Orp Structures HP",
      "h": "Structure resistance multiplier while offline."
     },
     {
      "k": "OrpStrLimit",
      "t": "int",
      "d": null,
      "n": "Orp Str Limit",
      "h": "ORP structure limit per tribe."
     },
     {
      "k": "OrpDecayTimer",
      "t": "int",
      "d": null,
      "n": "Orp Decay Timer",
      "h": "In seconds, auto decay after no log in by owning tribe."
     },
     {
      "k": "ORPInfiniteAmmo",
      "t": "bool",
      "d": null,
      "n": "ORP Infinite Ammo",
      "h": "True/False, infinite turret ammo while ORP is active."
     },
     {
      "k": "ORPGoldTurrets",
      "t": "bool",
      "d": null,
      "n": "ORP Gold Turrets",
      "h": "True/False, gold turrets while ORP active, cosmetic."
     },
     {
      "k": "UsePrograms",
      "t": "bool",
      "d": null,
      "n": "Use Programs",
      "h": "True/False, toggles the use of programs."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/hypers-offline-raid-protection"
 },
 {
  "id": 988797,
  "slug": "ark-omega-ascended",
  "name": "Ark Omega Ascended",
  "sum": "A huge overhaul that provides MMO and ARPG elements to Ark!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/993/366/256/256/638508233258474070.png",
  "dl": 469748,
  "author": "HexenLord",
  "cat": "overhaul",
  "mapName": "",
  "ini": []
 },
 {
  "id": 928592,
  "slug": "asashop",
  "name": "NatureShopUI",
  "sum": "A server store feature includes Points Store PR Store player trading missions support ",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1723/584/256/256/639096570769120951.png",
  "dl": 462720,
  "author": "naturexy",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 962796,
  "slug": "svartalfheim-premium",
  "name": "Svartalfheim Premium [PC & Crossplay]",
  "sum": "Svartalfheim Premium Version",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/947/678/256/256/638434292455373820.png",
  "dl": 453303,
  "author": "Nekatus_Modding",
  "cat": "maps",
  "mapName": "Svartalfheim_WP",
  "ini": []
 },
 {
  "id": 935835,
  "slug": "project-935835",
  "name": "Forglar (Free test Version)",
  "sum": "Forglar mod map  test Version",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1878/805/256/256/639176699714437293.png",
  "dl": 422893,
  "author": "SnowyTrain",
  "cat": "maps",
  "mapName": "Forglar_WP",
  "ini": []
 },
 {
  "id": 939901,
  "slug": "ez-stacks",
  "name": "EZ Stacks",
  "sum": "10k Stacks (-90% Weight)",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/907/760/256/256/638359252234901324.png",
  "dl": 411543,
  "author": "Valykai",
  "cat": "stacking",
  "mapName": "",
  "ini": [
   {
    "section": "EZStacks",
    "settings": [
     {
      "k": "DisableVanillaEngramUnlock",
      "t": "bool",
      "d": false,
      "n": "Disable Vanilla Engram Unlock",
      "h": "ON = stops the mod auto-unlocking its vanilla-item engrams."
     },
     {
      "k": "DisableTekEngramUnlock",
      "t": "bool",
      "d": false,
      "n": "Disable Tek Engram Unlock",
      "h": "ON = stops the mod auto-unlocking Tek engrams."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/ez-stacks"
 },
 {
  "id": 951374,
  "slug": "dino-ovherhaul-x-2",
  "name": "Dino Overhaul X 2",
  "sum": "Complete Reblance of Ark Survival Ascended",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/920/830/256/256/638384591344320217.png",
  "dl": 402506,
  "author": "equillizer04",
  "cat": "overhaul",
  "mapName": "",
  "ini": []
 },
 {
  "id": 939532,
  "slug": "insaluna",
  "name": "Insaluna",
  "sum": "a map full of lush biomes,dangerous peaks and hidden caves",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/909/604/256/256/638362843673138804.png",
  "dl": 389096,
  "author": "armangamer777",
  "cat": "maps",
  "mapName": "insaluna_WP",
  "ini": []
 },
 {
  "id": 932995,
  "slug": "tameable-bosses",
  "name": "Tameable Bosses",
  "sum": "Mod balanced to vanilla.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1114/62/256/256/638667205413414652.jpg",
  "dl": 380792,
  "author": "RyanLucas007",
  "cat": "dinos",
  "mapName": "",
  "ini": []
 },
 {
  "id": 931527,
  "slug": "better-chat",
  "name": "Better Chat  [Crossplatform]",
  "sum": "Improves Chatbox and adds Slash Commands",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/898/688/256/256/638344445703273652.png",
  "dl": 301503,
  "author": "Radioactive_Revy",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 930561,
  "slug": "dazzas-stacking-mod-craftable-element",
  "name": "Dazza's Stacking Mod + Craftable Element + Meat Spoiling",
  "sum": "Stacking Mod, Craftable Element and Meat Spoiling",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/897/938/256/256/638343278924852759.png",
  "dl": 285551,
  "author": "DazModding",
  "cat": "stacking",
  "mapName": "",
  "ini": []
 },
 {
  "id": 973536,
  "slug": "dino-shop-mod",
  "name": "Dino Shop",
  "sum": "Buy dinosaur!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1721/585/256/256/639095096146006932.jpg",
  "dl": 260041,
  "author": "sektor50000",
  "cat": "dinos",
  "mapName": "",
  "ini": []
 },
 {
  "id": 1134010,
  "slug": "better-dedicated-storage",
  "name": "Better Dedicated Storage",
  "sum": "Dedicated Storage, but better",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1111/331/256/256/638662790090932979.png",
  "dl": 257976,
  "author": "Quellcrest",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 1541636,
  "slug": "elite-orp-flag",
  "name": "Elite ORP FLAG",
  "sum": "Offline raid protection flag for PvP servers.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1805/141/256/256/639142258371202299.png",
  "dl": 256071,
  "author": "Cuddleee",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 974204,
  "slug": "jurassic-awakening",
  "name": "Jurassic Awakening",
  "sum": "New dino variants, more realistic AI behaviors, new weapons, new armor, advanced player progression. This is an overhaul mod that creates an entirely ",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1006/789/256/256/638528867438622657.png",
  "dl": 251425,
  "author": "Haliotro",
  "cat": "overhaul",
  "mapName": "",
  "ini": []
 },
 {
  "id": 929977,
  "slug": "ez-resources",
  "name": "Ez Resources [Cross-Platform]",
  "sum": "An small mod for harvest easily some rare resources",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/897/381/256/256/638342534939922850.png",
  "dl": 234522,
  "author": "Bauboy64",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 1069160,
  "slug": "circas-castles-keeps-forts",
  "name": "Circas Castle Mod",
  "sum": "A collection of MedievalRP based structures.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1427/531/256/256/638924749438613042.png",
  "dl": 216177,
  "author": "Circa",
  "cat": "structures",
  "mapName": "",
  "ini": []
 },
 {
  "id": 944375,
  "slug": "temptress-lagoon",
  "name": "Temptress Lagoon",
  "sum": "Now with x4 Boss Arenas and new artifact puzzle cave.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/953/619/256/256/638444500720148318.png",
  "dl": 211338,
  "author": "EpicMinerva",
  "cat": "maps",
  "mapName": "Temptress_WP",
  "ini": []
 },
 {
  "id": 1060817,
  "slug": "resonants-admin-panel-mod",
  "name": "Resonant's Admin Panel Mod",
  "sum": "A simple Admin Panel mod helping Admins manage their server all in one place!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1036/991/256/256/638561616907385802.png",
  "dl": 201807,
  "author": "Resonant",
  "cat": "admin",
  "mapName": "",
  "ini": []
 },
 {
  "id": 1232293,
  "slug": "bober-stacks-10k-90",
  "name": "Bober Stacks 10k/-90%",
  "sum": "10k Stacks with 90% Weight Reduction",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1458/478/256/256/638946647441588531.png",
  "dl": 172098,
  "author": "LeRaptorWild",
  "cat": "stacking",
  "mapName": "",
  "ini": []
 },
 {
  "id": 961155,
  "slug": "ketaros-advanced-building",
  "name": "Ketaros Advanced Building",
  "sum": "This mod allows you to build with much more freedom.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/932/170/256/256/638406587183544021.octet-stream",
  "dl": 162671,
  "author": "Ketaros",
  "cat": "structures",
  "mapName": "",
  "ini": []
 },
 {
  "id": 975626,
  "slug": "reverence",
  "name": "Reverence",
  "sum": "Survivors. Journey into a land not known by you, but by those who came before you",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/949/229/256/256/638437150791336331.png",
  "dl": 160321,
  "author": "kelthezuad",
  "cat": "maps",
  "mapName": "Reverence_WP",
  "ini": []
 },
 {
  "id": 1080078,
  "slug": "dino-levels-plus",
  "name": "Dino Levels Plus",
  "sum": "Super compatible - expands how many level ups you can get for your tamed dinos!!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1055/860/256/256/638587181227369541.octet-stream",
  "dl": 157410,
  "author": "Haliotro",
  "cat": "qol",
  "mapName": "",
  "ini": []
 },
 {
  "id": 938787,
  "slug": "element-harvesting",
  "name": "Element Harvesting (Crossplay Live)",
  "sum": "Tek Gauntlets that can harvest element from various resource nodes.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/906/464/256/256/638356594294362324.png",
  "dl": 150527,
  "author": "BangPlaysGames",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 930436,
  "slug": "lilys-reusables",
  "name": "Lily's Reusables",
  "sum": "Reusable Grapple, Bola, Flare, Spear, Parachute.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/897/803/256/256/638343082897353358.png",
  "dl": 134892,
  "author": "DelilahEve",
  "cat": "qol",
  "mapName": "",
  "ini": []
 },
 {
  "id": 965599,
  "slug": "nyrandil",
  "name": "Nyrandil",
  "sum": "Defeat the Ark Sanctuary",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/937/381/256/256/638415466811871294.png",
  "dl": 134008,
  "author": "YuTayARKMods",
  "cat": "maps",
  "mapName": "Nyrandil",
  "ini": []
 },
 {
  "id": 1442825,
  "slug": "ark-supreme",
  "name": "Ark Supreme",
  "sum": "A Giant Insane Dino overhaul",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1719/617/256/256/639093591455143545.png",
  "dl": 124270,
  "author": "MrChaos",
  "cat": "overhaul",
  "mapName": "",
  "ini": []
 },
 {
  "id": 982128,
  "slug": "althemia",
  "name": "ALTHEMIA",
  "sum": "ALTHEMIA Now available on cross play (Xbox X|S, PS5, & PC) is a mod map that is currently in development.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/979/865/256/256/638485765462792918.png",
  "dl": 122709,
  "author": "j26arkitecto",
  "cat": "maps",
  "mapName": "ALTHEMIA",
  "ini": []
 },
 {
  "id": 935306,
  "slug": "appalachia",
  "name": "Appalachia - Early Access",
  "sum": "Massive primitive survival map with new variants and new biomes that aim for a natural feel. Best for roleplaying the Frontier.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1064/192/256/256/638597248028520919.jpg",
  "dl": 110233,
  "author": "KalugaStudios",
  "cat": "maps",
  "mapName": "Appalachia_Official_WP",
  "ini": []
 },
 {
  "id": 1417419,
  "slug": "extra-bosses",
  "name": "Extra Bosses",
  "sum": "Adjust vanilla bosses to make them stronger, and added tamable bosses",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1598/542/256/256/639033065956123499.jpeg",
  "dl": 101496,
  "author": "EmptyDream233",
  "cat": "dinos",
  "mapName": "",
  "ini": [
   {
    "section": "Extra Boss",
    "settings": [
     {
      "k": "AllowSpiderImprintingDinos",
      "t": "bool",
      "d": true,
      "n": "Allow Spider Imprinting Dinos",
      "h": "Allow imprinting on tamable spiders."
     },
     {
      "k": "ExtraDefence",
      "t": "bool",
      "d": false,
      "n": "Extra Defence",
      "h": "Boss has 50% damage reduction against Moro Rex."
     },
     {
      "k": "EnableExtraBoss",
      "t": "bool",
      "d": true,
      "n": "Enable Extra Boss",
      "h": "Enable ExtraBoss: when disabled, bosses keep debuff immunity without enhancements."
     },
     {
      "k": "TamableBosses",
      "t": "bool",
      "d": true,
      "n": "Tamable Bosses",
      "h": "Defeating the ExtraBoss drops a tamable version."
     },
     {
      "k": "DeinonychusBleeding",
      "t": "bool",
      "d": false,
      "n": "Deinonychus Bleeding",
      "h": "Allow Deinonychus to apply bleed to bosses."
     },
     {
      "k": "ExtraLoots",
      "t": "bool",
      "d": false,
      "n": "Extra Loots",
      "h": "Enable additional loot crates."
     },
     {
      "k": "ExtraLootsWildBoss",
      "t": "bool",
      "d": false,
      "n": "Extra Loots Wild Boss",
      "h": "Enable additional loot crates from wild bosses."
     },
     {
      "k": "ChanceToGiveBP",
      "t": "float",
      "d": 0.2,
      "n": "Chance To Give BP",
      "h": "Chance for a loot crate to give a Blueprint, 0 to 1."
     },
     {
      "k": "MinItemQuality",
      "t": "int",
      "d": 1,
      "n": "Min Item Quality",
      "h": "Minimum quality of items from loot crates."
     },
     {
      "k": "MaxItemQuality",
      "t": "int",
      "d": 15,
      "n": "Max Item Quality",
      "h": "Maximum quality of items from loot crates."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/extra-bosses"
 },
 {
  "id": 1158003,
  "slug": "the-volcano",
  "name": "The Volcano",
  "sum": "Free version of my most successful ASE mod map, now for ASA. Optimized for cross-platform.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1134/950/256/256/638696040098840141.octet-stream",
  "dl": 99907,
  "author": "sicco0803",
  "cat": "maps",
  "mapName": "TheVolcano_WP",
  "ini": []
 },
 {
  "id": 1493855,
  "slug": "magas-shop-mod",
  "name": "MagaArk's Shop Mod",
  "sum": "Lets server Admins create in-game packages of dinos and items that players can purchase for cluster-wide points.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1727/148/256/256/639098918007454733.png",
  "dl": 97291,
  "author": "OrlandoisLive",
  "cat": "utility",
  "mapName": "",
  "ini": [
   {
    "section": "MagaShop",
    "settings": [
     {
      "k": "Cryopod",
      "t": "str",
      "d": null,
      "n": "Cryopod",
      "h": "Item path of the cryopod item the shop hands out."
     },
     {
      "k": "WebhookURL",
      "t": "str",
      "d": null,
      "n": "Webhook URL",
      "h": "Your Discord webhook URL for shop logging."
     },
     {
      "k": "TradeThreadID",
      "t": "int",
      "d": null,
      "n": "Trade Thread ID",
      "h": "Discord thread ID for trades."
     },
     {
      "k": "AddPackagesThreadID",
      "t": "int",
      "d": null,
      "n": "Add Packages Thread ID",
      "h": "Discord thread ID for added packages."
     },
     {
      "k": "EditPackagesThreadID",
      "t": "int",
      "d": null,
      "n": "Edit Packages Thread ID",
      "h": "Discord thread ID for edited packages."
     },
     {
      "k": "ShopSettingsChangedThreadID",
      "t": "int",
      "d": null,
      "n": "Shop Settings Changed Thread ID",
      "h": "Discord thread ID for settings changes."
     },
     {
      "k": "ShopPackageBoughtThreadID",
      "t": "int",
      "d": null,
      "n": "Shop Package Bought Thread ID",
      "h": "Discord thread ID for purchases."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/magas-shop-mod"
 },
 {
  "id": 1157184,
  "slug": "thaloria",
  "name": "Thaloria",
  "sum": "Thaloria is a cold and frigid place spanning 37km².",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1155/52/256/256/638722564079776271.png",
  "dl": 90438,
  "author": "WM_Plays0",
  "cat": "maps",
  "mapName": "Thaloria_WP",
  "ini": []
 },
 {
  "id": 934129,
  "slug": "configurable-stack-mod",
  "name": "Configurable Stack Mod",
  "sum": "Stack Mod that allows you to change the Stack Sizes and Weight.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/901/306/256/256/638348517653142320.png",
  "dl": 79936,
  "author": "Valykai",
  "cat": "stacking",
  "mapName": "",
  "ini": [
   {
    "section": "ConfigurableStacks",
    "settings": [
     {
      "k": "AmmoStackSize",
      "t": "int",
      "d": 2500,
      "n": "Ammo Stack Size",
      "h": "Stack size for ammunition."
     },
     {
      "k": "AmmoWeight",
      "t": "float",
      "d": 0.01,
      "n": "Ammo Weight",
      "h": "Weight multiplier for ammunition (0.01 = 1% of normal)."
     },
     {
      "k": "ConsumablesStackSize",
      "t": "int",
      "d": 25000,
      "n": "Consumables Stack Size",
      "h": "Stack size for food and consumables."
     },
     {
      "k": "ConsumablesWeight",
      "t": "float",
      "d": 0.005,
      "n": "Consumables Weight",
      "h": "Weight multiplier for consumables."
     },
     {
      "k": "KibbleStackSize",
      "t": "int",
      "d": 10000,
      "n": "Kibble Stack Size",
      "h": "Stack size for kibble."
     },
     {
      "k": "KibbleWeight",
      "t": "float",
      "d": 0.001,
      "n": "Kibble Weight",
      "h": "Weight multiplier for kibble."
     },
     {
      "k": "ResourcesStackSize",
      "t": "int",
      "d": 50000,
      "n": "Resources Stack Size",
      "h": "Stack size for resources (wood, stone, ...)."
     },
     {
      "k": "ResourcesWeight",
      "t": "float",
      "d": 0.005,
      "n": "Resources Weight",
      "h": "Weight multiplier for resources."
     },
     {
      "k": "SeedsStackSize",
      "t": "int",
      "d": 10000,
      "n": "Seeds Stack Size",
      "h": "Stack size for seeds."
     },
     {
      "k": "SeedsWeight",
      "t": "float",
      "d": 0.001,
      "n": "Seeds Weight",
      "h": "Weight multiplier for seeds."
     },
     {
      "k": "DisableVanillaEngramUnlock",
      "t": "bool",
      "d": false,
      "n": "Disable Vanilla Engram Unlock",
      "h": "ON = stops the mod auto-unlocking its vanilla-item engrams."
     },
     {
      "k": "DisableTekEngramUnlock",
      "t": "bool",
      "d": false,
      "n": "Disable Tek Engram Unlock",
      "h": "ON = stops the mod auto-unlocking Tek engrams."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/configurable-stack-mod"
 },
 {
  "id": 984808,
  "slug": "taeniastella",
  "name": "TaeniaStella",
  "sum": "TaeniaStella coming ASA!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/960/192/256/256/638455928924653557.octet-stream",
  "dl": 75965,
  "author": "TeamMIROKU",
  "cat": "maps",
  "mapName": "TaeniaStella_WP",
  "ini": []
 },
 {
  "id": 1492812,
  "slug": "realistic-farm-automation",
  "name": "Realistic Farm Automation",
  "sum": "A modular system to streamline resource generation from your creatures — without breaking immersion!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1725/635/256/256/639097948373246496.png",
  "dl": 65894,
  "author": "AifiasGaming",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 931872,
  "slug": "auxuls-stacking-mod",
  "name": "Auxul's Stacking Mod",
  "sum": "A PVE focused Stack Mod",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/899/58/256/256/638344853371565999.png",
  "dl": 46430,
  "author": "Auxul",
  "cat": "stacking",
  "mapName": "",
  "ini": []
 },
 {
  "id": 1361878,
  "slug": "eternal-chaos-premium",
  "name": "Eternal Chaos",
  "sum": "Ark Ascended's Ultimate overhaul mod!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1697/603/256/256/639077954479919941.png",
  "dl": 43227,
  "author": "Icydog7272",
  "cat": "overhaul",
  "mapName": "",
  "ini": []
 },
 {
  "id": 933204,
  "slug": "drake_edwins-stack-mod",
  "name": "drake_edwin's stack mod",
  "sum": "Change the weight of resources and the size of their stacks",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/901/15/256/256/638348080120189601.png",
  "dl": 30157,
  "author": "drake_edwin",
  "cat": "stacking",
  "mapName": "",
  "ini": []
 },
 {
  "id": 936831,
  "slug": "auto-harvest-transfer",
  "name": "Critter Resource Collector: Remote Depot",
  "sum": "Adds a dedicated storage box that lets tamed creatures remotely send resources back to it.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1133/741/256/256/638694290651164213.png",
  "dl": 24848,
  "author": "Shinygati",
  "cat": "utility",
  "mapName": "",
  "ini": [
   {
    "section": "CritterResourceCollector",
    "settings": [
     {
      "k": "MaxSlots",
      "t": "int",
      "d": 300,
      "n": "Max Slots",
      "h": "Inventory slots of the Remote Depot storage box."
     }
    ],
    "file": "gus"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/auto-harvest-transfer"
 },
 {
  "id": 1233243,
  "slug": "immersive-taming",
  "name": "Immersive Taming",
  "sum": "A taming alternative that allows creatures to be tamed through in-game actions vs traditional inventory items and timers.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1212/768/256/256/638790815202126951.png",
  "dl": 18715,
  "author": "Burgesssssss",
  "cat": "overhaul",
  "mapName": "",
  "ini": [
   {
    "section": "/Script/ShooterGame.ShooterGameMode",
    "settings": [
     {
      "k": "bDisableDefaultDinoTaming",
      "t": "bool",
      "d": true,
      "n": "Disable Default Dino Taming",
      "h": "Turn off normal taming so only immersive taming works."
     },
     {
      "k": "PreventDisableDefaultDinoTameClassNames",
      "t": "str",
      "d": null,
      "n": "Prevent Disable Default Dino Tame Class Names",
      "h": "Dino class names that can still be tamed normally."
     }
    ],
    "file": "game"
   }
  ],
  "src": "https://www.curseforge.com/ark-survival-ascended/mods/immersive-taming"
 },
 {
  "id": 1076941,
  "slug": "discord-chat",
  "name": "Discord chat",
  "sum": "Bridge your server chat with a Discord channel.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/1547/514/256/256/639004350669769875.png",
  "dl": 17716,
  "author": "unknown01110101",
  "cat": "utility",
  "mapName": "",
  "ini": []
 },
 {
  "id": 1017592,
  "slug": "seven-deadly-ascended",
  "name": "Seven Deadly Ascended",
  "sum": "Take on the embodiment of Sin and transform into your favorite creature!",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/995/229/256/256/638511252761484104.png",
  "dl": 15025,
  "author": "TheNokosa",
  "cat": "overhaul",
  "mapName": "",
  "ini": []
 },
 {
  "id": 966587,
  "slug": "sensational-structures",
  "name": "Sensational Structures",
  "sum": "A range of structures and items to make your gameplay more enjoyable.",
  "thumb": "https://83374.media.forgecdn.net/avatars/thumbnails/978/934/256/256/638484232973326605.png",
  "dl": 9209,
  "author": "DreamDoctor",
  "cat": "structures",
  "mapName": "",
  "ini": []
 }
];

const MOD_CATS = {
  qol:        { icon: '\u2728', name: 'Quality of Life' },
  structures: { icon: '\ud83c\udfd7\ufe0f', name: 'Building' },
  dinos:      { icon: '\ud83e\udd96', name: 'Creatures' },
  maps:       { icon: '\ud83d\uddfa\ufe0f', name: 'Maps' },
  stacking:   { icon: '\ud83d\udce6', name: 'Stacking & Resources' },
  utility:    { icon: '\ud83d\udd27', name: 'Utility' },
  overhaul:   { icon: '\ud83c\udfae', name: 'Gameplay' },
  admin:      { icon: '\ud83d\udee1\ufe0f', name: 'Server Admin' },
  cosmetics:  { icon: '\ud83c\udfa8', name: 'Cosmetics' },
  other:      { icon: '\ud83e\udde9', name: 'Other' },
};
