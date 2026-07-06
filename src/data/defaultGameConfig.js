// 개발자 설정 관제실(System Control Room)의 기본값 — 전투 v1.0 모든 수치/규칙의 단일 출처.
// 코드에 수치를 하드코딩하지 않고 이 객체에서 읽어온다(개발 요청서 32-1).
// 저장은 useGameConfigStore가 localStorage("star_dev_config")로 담당하며,
// 저장본은 이 DEFAULT 위에 deep-merge 되어 신규 키가 자동 반영된다.

// 연구 단계(해금한 최고 무기 티어)별 전장 크기 (요청서 2장).
export const BATTLEFIELD_SIZE_BY_TIER = {
  1: { width: 10, height: 8 },
  2: { width: 12, height: 10 },
  3: { width: 14, height: 12 },
  4: { width: 18, height: 14 },
  5: { width: 20, height: 16 },
}

// 우선순위 충돌 해결 규칙 (요청서 30장). priority 오름차순으로 계산 단계가 실행된다.
// group: accuracy | evasion | damage | shield_armor | movement | field | retreat | reward
export const DEFAULT_PRIORITY_RULES = [
  // ── Accuracy ──
  { id: 'accuracy_base_weapon',        label: 'Weapon Base Accuracy',              group: 'accuracy', enabled: true, priority: 10, description: '무기 기본 명중률' },
  { id: 'accuracy_attacker_equipment', label: 'Attacker Equipment Accuracy Bonus', group: 'accuracy', enabled: true, priority: 20, description: '공격자 장비 명중 보정' },
  { id: 'accuracy_attacker_module',    label: 'Attacker Module Accuracy Bonus',    group: 'accuracy', enabled: true, priority: 25, description: '공격자 모듈 명중 보정' },
  { id: 'accuracy_ship_flagship',      label: 'Ship / Flagship Accuracy',          group: 'accuracy', enabled: true, priority: 30, description: '함선·기함 보정' },
  { id: 'accuracy_terrain_penalty',    label: 'Terrain Accuracy Penalty',          group: 'accuracy', enabled: true, priority: 40, description: '지형 명중 보정(성운/잔해 등)' },
  { id: 'accuracy_damage_state',       label: 'Damage State Accuracy Penalty',     group: 'accuracy', enabled: true, priority: 50, description: '중파/대파 명중 페널티' },
  { id: 'accuracy_retreating_penalty', label: 'Retreating Accuracy Penalty',       group: 'accuracy', enabled: true, priority: 60, description: '후퇴 중 명중 -20%' },
  { id: 'accuracy_subtract_evasion',   label: 'Subtract Defender Evasion',         group: 'accuracy', enabled: true, priority: 70, description: '대상 최종 회피율 차감' },
  { id: 'accuracy_clamp',              label: 'Clamp 15~95%',                      group: 'accuracy', enabled: true, priority: 80, description: '최소/최대 명중률 제한' },

  // ── Evasion ──
  { id: 'evasion_defender_base',  label: 'Defender Base Evasion', group: 'evasion', enabled: true, priority: 10, description: '함선 기본 회피율' },
  { id: 'evasion_engine_bonus',   label: 'Engine Evasion Bonus',  group: 'evasion', enabled: true, priority: 20, description: '엔진 회피 보정' },
  { id: 'evasion_shield_bonus',   label: 'Shield Evasion Bonus',  group: 'evasion', enabled: true, priority: 30, description: '쉴드 회피 보정' },
  { id: 'evasion_equipment_bonus',label: 'Equipment/Module Evasion Bonus', group: 'evasion', enabled: true, priority: 40, description: '장비/모듈 회피 보정' },
  { id: 'evasion_terrain_bonus',  label: 'Terrain Evasion Bonus', group: 'evasion', enabled: true, priority: 50, description: '지형 회피 보정(성운/잔해)' },

  // ── Damage (Shield → Armor → HP) ──
  { id: 'damage_shield_pierce_split', label: 'Shield Pierce Damage Split', group: 'damage', enabled: true, priority: 10, description: 'Shield Pierce 피해 분할' },
  { id: 'damage_shield_absorb',       label: 'Shield Absorption',          group: 'damage', enabled: true, priority: 20, description: 'Shield 우선 흡수' },
  { id: 'damage_armor_reduction',     label: 'Armor Damage Reduction',     group: 'damage', enabled: true, priority: 30, description: 'Armor 피해 감소' },
  { id: 'damage_defense_stance',      label: 'Defense Stance Reduction',   group: 'damage', enabled: true, priority: 40, description: '방어 태세 피해 감소' },
  { id: 'damage_hp_apply',            label: 'Apply HP Damage',            group: 'damage', enabled: true, priority: 50, description: 'HP 피해 적용' },
  { id: 'damage_armor_durability',    label: 'Reduce Armor Durability',    group: 'damage', enabled: true, priority: 60, description: 'Armor 내구도 감소' },
  { id: 'ship_destroyed_check',       label: 'Ship Destroyed Check',       group: 'damage', enabled: true, priority: 70, description: '함선 격파 판정' },

  // ── Movement cost ──
  { id: 'movement_base_cost',    label: 'Base Move Cost',    group: 'movement', enabled: true, priority: 10, description: '기본 이동 비용' },
  { id: 'movement_terrain_cost', label: 'Terrain Move Cost', group: 'movement', enabled: true, priority: 20, description: '지형별 이동 비용' },

  // ── Field effects ──
  { id: 'field_entry_damage',    label: 'Field Entry Damage',    group: 'field', enabled: true, priority: 10, description: '필드 진입 피해(지뢰/포탈)' },
  { id: 'field_periodic_damage', label: 'Field Periodic Damage', group: 'field', enabled: true, priority: 20, description: '필드 지속 피해(잔열/중력장)' },

  // ── Retreat / Negotiation ──
  { id: 'retreat_flagship_power',  label: 'Flagship Power Compare',  group: 'retreat', enabled: true, priority: 10, description: '아군/적 기함 전투력 비교' },
  { id: 'retreat_enemy_damage',    label: 'Enemy Damage Bonus',      group: 'retreat', enabled: true, priority: 20, description: '적 손상도 보정' },
  { id: 'retreat_research_bonus',  label: 'Research Bonus',          group: 'retreat', enabled: true, priority: 30, description: '연구 보정(Communications 등)' },
  { id: 'retreat_clamp',           label: 'Clamp Min/Max',           group: 'retreat', enabled: true, priority: 40, description: '후퇴/교섭 확률 제한' },

  // ── Reward / Surrender ──
  { id: 'reward_surrender_check', label: 'Surrender → Ship Capture', group: 'reward', enabled: true, priority: 10, description: '투항 함선은 함선 자체가 보상' },
  { id: 'reward_normal_loot',     label: 'Normal Loot',              group: 'reward', enabled: true, priority: 20, description: '격파 적 일반 보상' },
]

export const DEFAULT_GAME_CONFIG = {
  combat: {
    battlefieldSizeByTier: { ...BATTLEFIELD_SIZE_BY_TIER },

    // 연구 단계(해금한 최고 무기 티어) 매핑 — 해금된 연구 id → 무기 티어. 최댓값이 현재 티어.
    // 미해금 시 기본 Tier 1. 추후 Tier IV/V 무기 연구가 추가되면 여기에 매핑한다.
    weaponTierByResearch: {
      weapon_eng_1: 2,
      weapon_eng_adv: 3,
      weapon_eng_4: 4,
      weapon_eng_5: 5,
    },

    movement: {
      allowDiagonalMovement: false,
      baseMoveCost: 1,
      // 통과 불가(obstacle)는 이동 불가 — moveCost는 참고용 null.
      terrainMoveCosts: {
        space: 1,
        asteroid: 2,
        nebula: 2,
        debris: 2,
        gravityAnomaly: 3,
        obstacle: null,
      },
    },

    terrain: {
      nebula: {
        attackerAccuracyPenaltyFromOutside: -20,
        defenderEvasionBonusInside: 20,
      },
      debris: {
        attackerAccuracyPenalty: -50,
      },
    },

    accuracy: {
      minHitChance: 15,
      maxHitChance: 95,
      useDistancePenalty: false,
      useCoverSystem: false,
    },

    defense: {
      consumeAllRemainingAp: true,
      damageReductionPerAp: 5,      // 사용 AP × 5%
      maxDamageReduction: 40,
      // 함선 방어 효율 (요청서 16장)
      shipDefenseEfficiency: {
        gunship: 0.8,
        frigate: 0.9,
        destroyer: 1.0,
        cruiser: 1.1,
        battlecruiser: 1.15,
        dreadnought: 1.25,
      },
      // Frigate 고유 Adaptive Combat — 방어 태세 시 Armor +10%
      frigateAdaptiveCombatArmorBonus: 0.10,
    },

    overwatch: {
      consumeAllRemainingAp: true,
      maxTriggersPerTurn: 1,
      duration: 1,                  // 경계 태세 지속 턴 수. 1 = 발동 턴만. 2+ = 다음 턴까지 유지.
      damageMultiplier: 0.7,        // 반격 피해 = 통상 70%
      // 사용 AP별 경계 효과 (요청서 17장). accuracyPenalty는 반격 명중 보정.
      rulesByAp: {
        1: { radius: 2, chance: 20,  accuracyPenalty: -15 },
        2: { radius: 2, chance: 40,  accuracyPenalty: -15 },
        3: { radius: 3, chance: 60,  accuracyPenalty: -10 },
        4: { radius: 3, chance: 80,  accuracyPenalty: -10 },
        5: { radius: 3, chance: 100, accuracyPenalty: -5 },
      },
    },

    weapon: {
      cooldownEnabled: false,          // v1.0 쿨타임 미사용 (요청서 9장)
      multiSlotAttackEnabled: false,   // 다중 슬롯 동시발사 미구현
      maxAttacksPerTurnDefault: 1,
    },

    // 무기 계열별 고유 메커니즘 수치 (MASTER_PLAN Phase 4 · weapons_master_plan.md)
    weaponEffects: {
      laser: {
        pierceSecondMult: 0.5,   // T3 관통 빔 — 2번째 피격 배율
        deflectMults: [1, 1],    // T4 굴절 빔 — [적 굴절점, 타깃] 피격 배율
        phaseMults: [1, 1, 0.5], // T5 위상 랜스 — 피격 순서별 배율 (최대 3기)
      },
      ion: {
        jammer:          { accMod: -30, evaMod: -30, turns: 1 },          // T1 — 명중/회피 감소 (확정)
        apDisruptor:     { apDrainChance: 0.35, apDrainAmount: 2, stunChance: 0.15 }, // T2 — AP-2 또는 스턴 (동시 발생 없음)
        shieldNullifier: { baseChance: 0.3, rechargeBlockTurns: 1 },      // T3 — 최종 확률 = baseChance × 이온 취약도
        iffScrambler:    { turns: 1, bossFallback: { accMod: -20, evaMod: -20, turns: 1 } }, // T4 — 보스는 디버프로 약화
        systemCollapse:  { accMod: -70, evaMod: -70, turns: 1, shieldNullifyChance: 0.6, stunChanceOnNullify: 0.25 }, // T5
      },
      plasma: {
        armorMelter: { defPct: -30, turns: 1, permanentChance: 0.15 },              // T1 — 방어력 약화 (낮은 확률 전투 종료까지)
        coreMelter:  { defPct: -30, atkPct: -30, turns: 1, permanentChance: 0.15 }, // T2 — 방어/공격 약화
        burstMults:    [1.0, 0.8, 0.6],  // T3 5×5 폭발 — [중심, 1칸, 2칸] 배율 (아군도 피해)
        hellfireMults: [1.2, 1.0, 0.8],  // T4 강화 폭발
        heatZoneTurns: 1,                // T4 잔열 지속 턴 (다음 턴까지)
        heatZoneArmorPct: -50,           // 잔열 위 방어력 감소 — 환경성, 벗어나면 해제
        annihilator: {                   // T5 — 쉴드 무시는 pierce 데이터로, 아래는 부가 효과
          maxHpStrongChance: 0.25, maxHpNormalPct: 30, maxHpStrongPct: 50,
          boss: { defPct: -50, defChance: 0.7, maxHpNormalPct: 10, maxHpStrongPct: 20, maxHpStrongChance: 0.25 },
        },
      },
      // 보스 예외 공통 레이어 (weapons_master_plan §8 — 그대로 적용 금지 규칙의 변환값)
      bossExceptions: {
        stunConvertsToApDrain: 1,  // 스턴 → AP -1
        iffScrambleAllowed: false, // 피아식별 교란 불가 → iffScrambler.bossFallback 적용
      },
    },

    damage: {
      armorIsHpLayer: false,
      armorIsDamageReduction: true,
      armorReductionFormula: 'damage * (100 / (100 + armor))',
      armorDurabilityLossRate: 0.2,    // HP 적용 전 남은 피해 × 20%
      shieldPierceBypassesShield: true,
      shieldPierceBypassesArmor: false,
    },

    shield: {
      autoRechargeDuringBattle: false,
      itemRechargeAllowed: true,
      carryOverBetweenBattles: true,
      minimumRechargeIfDepletedNextBattle: 0.2,
      ionVulnerabilityDefault: 1.0,    // 쉴드 이온 취약도 — 등급 체계 상세화 전까지 전 함선 1.0 (기본 쉴드)
    },

    statusEffects: {
      enabled: false,                  // 상태이상 시스템 미구현 (요청서 20장)
    },

    fieldEffects: {
      enabled: true,
      types: ['mine', 'portal', 'residual_heat', 'gravity_well', 'black_hole', 'energy_storm'],
      // 타입별 기본 수치(관제실에서 조정). amount는 최대 HP 대비 %.
      params: {
        mine:          { entryDamagePct: 25, periodicDamagePct: 0 },
        portal:        { entryDamagePct: 0,  periodicDamagePct: 8 },
        residual_heat: { entryDamagePct: 0,  periodicDamagePct: 5 },
        gravity_well:  { entryDamagePct: 0,  periodicDamagePct: 0, extraMoveCost: 2 },
        black_hole:    { entryDamagePct: 0,  periodicDamagePct: 10 },
        energy_storm:  { entryDamagePct: 0,  periodicDamagePct: 3 },
      },
    },

    // 함선 손상 단계 (요청서 21장). HP 비율(%) 임계값 기준.
    damageStates: {
      normal: { minHpPct: 71, apMod: 0,  accMod: 0,   evaMod: 0,  canOverwatch: true,  label: '정상' },
      light:  { minHpPct: 41, apMod: 0,  accMod: 0,   evaMod: -5, canOverwatch: true,  label: '경미 손상' },
      medium: { minHpPct: 21, apMod: -1, accMod: -5,  evaMod: 0,  canOverwatch: true,  label: '중파' },
      heavy:  { minHpPct: 1,  apMod: -2, accMod: -10, evaMod: 0,  canOverwatch: false, label: '대파' },
      // HP 0% = 격파(destroyed) — 별도 단계로 코드에서 처리.
    },

    retreat: {
      instantCheck: true,
      exitTiming: 'next_round_start',
      failurePenaltyTarget: 'player_flagship',
      failurePenalty: 'set_remaining_ap_to_zero',
      baseChance: 0,                   // 기함 전투력 비교가 주 동력 (요청서 23장)
      minChance: 15,
      maxChance: 90,
      retreatingAccuracyPenalty: -20,
      retreatingEvasionPenalty: -10,
      retreatingCannotDefend: true,
      retreatingCannotOverwatch: true,
      allAlliesRetreatedIsDefeat: true, // 임무 타입별 분기 가능
    },

    negotiation: {
      instantCheck: true,
      failurePenaltyTarget: 'player_flagship',
      failurePenalty: 'set_remaining_ap_to_zero',
      baseChance: 25,                  // 요청서 24장 기본 25%
      minChance: 5,
      maxChance: 85,
      // 교섭 확률 보정 (요청서 24장 추천표)
      bonuses: {
        flagshipPowerAdvantageMax: 20,
        enemyHpBelow50: 10,
        enemyHpBelow30: 20,
        enemyFlagshipHpBelow30: 15,
        researchCommunications: 10,
        researchSignalIntercept: 5,
        researchDiplomaticChannel: 15,
        ionStartingPlanet: 5,
        enemyBossOrFanatic: -30,
        enemyPirateOrMercenary: 10,
      },
    },

    // 기함 전투력 공식 가중치 (요청서 24장)
    flagshipPower: {
      hpWeight: 0.25,
      armorWeight: 0.2,
      shieldWeight: 0.2,
      weaponWeight: 0.25,
      apWeight: 8,
      evasionWeight: 1.5,
    },

    flagship: {
      required: true,
      playerCanSelect: true,
      enemyAutoSelect: true,
      flagshipDestroyedIsDefeatDefault: false,
      playerFlagshipDestroyedEffects: {
        canRetreat: false,
        canNegotiate: false,
        allyAccuracyPenalty: -5,
      },
      enemyFlagshipDestroyedEffects: {
        enemyAccuracyPenalty: -5,
        negotiationChanceBonus: 20,
      },
    },

    // 기본 함선 AP (요청서 4장). ships.json 값과 별개로 관제실에서 덮어쓸 수 있는 기준치.
    baseApByClass: {
      gunship: 8,
      frigate: 7,
      destroyer: 6,
      cruiser: 5,
      battlecruiser: 5,
      dreadnought: 4,
    },

    // 행동별 AP 소모 기본 규칙 (요청서 4장)
    apCosts: {
      movePerTile: 1,
      defenseStanceConsumesAll: true,
      overwatchConsumesAll: true,
    },

    dreadnought: {
      maxPerBattle: 1,
      editableInConfig: true,
    },

    // 투항 보상 (요청서 22장) — 격파 시 일정 확률로 함선 자체를 포획.
    surrender: {
      enabled: true,
      baseChance: 20,         // % — 일반 적이 격파될 때 투항할 기본 확률
      bossCanSurrender: false, // boss 역할 적은 투항하지 않음
    },

    // 임시 승패 조건 (요청서 35장) — 임무 타입별 확장 가능.
    victory: {
      winOnAllEnemiesDestroyedOrSurrendered: true,
      loseOnAllAlliesDestroyedOrRetreated: true,
    },
  },

  // 타 시스템 override (런타임 적용은 다음 단계 — 이번 단계는 편집/저장까지).
  overrides: {
    buildings: {},
    research: {},
    resources: {},
    enemyScaling: {},
    shipStats: {},   // shipId → { hp, atk, def, acc, eva, ap, shield, armor, ... }
    weaponStats: {}, // weaponId → { atk, range, ap, accuracy, pierce, ... }
  },

  priorityRules: DEFAULT_PRIORITY_RULES.map((r) => ({ ...r })),
}

// config 버전 — 구조가 크게 바뀌면 올려서 마이그레이션 트리거로 사용.
export const GAME_CONFIG_VERSION = 1
