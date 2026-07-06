import { useState, useEffect, useRef } from 'react'
import { useDataStore } from '../../state/useDataStore'
import { useProgressStore } from '../../state/useProgressStore'
import { useDevelopmentStore } from '../../state/useDevelopmentStore'
import { useResourceStore } from '../../state/useResourceStore'
import { useFleetStore } from '../../state/useFleetStore'
import { useSettingsStore } from '../../state/useSettingsStore'
import { pickEventType, pickSpecialEvent, buildResourceEvent, extractResourceEffect } from '../../core/events'
import { xpRewardForVictory, getEffectiveShip } from '../../core/growth'
import EventModal from '../components/EventModal'
import './StrategyMapScreen.css'

const RESOURCE_NAMES = { sc: '스텔라크레딧', ti: '티타늄', ec: '에너지크리스탈', dm: '다크매터' }
const RESOURCE_ICONS = { sc: '💰', ti: '🔩', ec: '💎', dm: '🌑' }

const PEACE_MESSAGES = [
  '함대가 잠시 휴식을 취했습니다. 승무원들의 사기가 올랐습니다.',
  '성간 공간의 고요함 속에서 잠시 숨을 고릅니다.',
  '특별한 위협 없이 항법 시뮬레이션을 진행했습니다.',
  '일상적인 항해입니다. 정비반이 엔진 점검을 마쳤습니다.',
]

const SYS_POS = {
  s0: { x: 8,  y: 50 },
  s1: { x: 28, y: 22 },
  s2: { x: 50, y: 65 },
  s3: { x: 72, y: 25 },
  s4: { x: 92, y: 55 },
}

const ROLE_ICON = { home: '🏠', mission: '🪐', boss: '👹' }
const STATUS_LABEL = {
  current:   '📍 현재 위치',
  conquered: '✅ 정복 완료',
  reachable: '🚀 진입 가능',
  locked:    '🔒 미탐색 — 인접 별계를 먼저 정복하세요',
}
// 적 함대와 플레이어가 실제로 겹쳐야 전투 발동 (% 단위)
const ENCOUNTER_DIST = 2.5
const SYSTEM_DIST    = 7
// 캔버스 위에서 별계 아이콘 호버/클릭 판정 반경 (px) — 아이콘(104px 폰트)·선택 링(반경 96px)을 모두 포함
const NODE_HIT_RADIUS = 80

// 모항 안전지대 — 이 반경 안으로는 적이 들어올 수 없고, 전투도 발동하지 않음
const HOME_POS          = SYS_POS.s0
const HOME_SAFE_RADIUS  = 13
// 이 위협 레벨 이하의 적(저레벨 구간 의적)은 비호전적 — 추격하지 않고 배회하다 마주치면 전투
const PASSIVE_THREAT_LV = 2

// 모항 안전지대 경계 밖으로 밀어내기(반사) — 모든 적 이동 결과의 마지막에 적용
function repelHome(obj) {
  const dx = obj.x - HOME_POS.x, dy = obj.y - HOME_POS.y
  const d = Math.hypot(dx, dy)
  if (d >= HOME_SAFE_RADIUS || d === 0) return obj
  return {
    ...obj,
    x: HOME_POS.x + (dx / d) * HOME_SAFE_RADIUS,
    y: HOME_POS.y + (dy / d) * HOME_SAFE_RADIUS,
    vx: -obj.vx, vy: -obj.vy,
    chasing: false,
  }
}

// 별계/모항 안전지대와 너무 가까운 좌표인지 검사 (스폰 위치 결정용)
function tooCloseToSystem(x, y) {
  for (const [key, pos] of Object.entries(SYS_POS)) {
    const r = key === 's0' ? HOME_SAFE_RADIUS : 9
    if (Math.hypot(x - pos.x, y - pos.y) < r) return true
  }
  return false
}

// 위협 레벨이 높은 노드일수록 리스폰될 확률이 높음 (가중 랜덤)
function pickNodeWeighted(nodes) {
  if (!nodes.length) return null
  const total = nodes.reduce((sum, n) => sum + (n.threatLevel ?? 1), 0)
  let rand = Math.random() * total
  for (const n of nodes) {
    rand -= n.threatLevel ?? 1
    if (rand <= 0) return n
  }
  return nodes[nodes.length - 1]
}

// 맵 이벤트 요소 — 상인/표류 함선 (전투 외 이벤트 시각화)
const MAP_EVENT_TYPES = ['merchant', 'derelict']
const MAP_EVENT_ICON  = { merchant: '🛒', derelict: '🛰️' }
const MAP_EVENT_GLOW  = { merchant: 'rgba(255,209,102,', derelict: 'rgba(124,255,178,' }
const MAP_EVENT_COUNT = 6

// 위협도(threatLevel 1~7+)에 따른 색상 단계 — 낮음(시안)→보통(녹/노랑)→높음(주황)→매우높음(빨강/보라)
const THREAT_COLOR_RGB = ['58,214,196', '126,231,135', '255,209,102', '255,169,77', '255,107,107', '230,73,79', '192,132,252']
function threatColorRgb(level) {
  const idx = Math.min(THREAT_COLOR_RGB.length, Math.max(1, Math.round(level ?? 1))) - 1
  return THREAT_COLOR_RGB[idx]
}

function spawnMapEvent(idBase) {
  for (let tries = 0; tries < 40; tries++) {
    const x = 5 + Math.random() * 90
    const y = 5 + Math.random() * 90
    if (tooCloseToSystem(x, y)) continue
    const type = MAP_EVENT_TYPES[Math.floor(Math.random() * MAP_EVENT_TYPES.length)]
    return { id: String(idBase), x, y, type, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6 }
  }
  return null
}

function genMapEvents(count = MAP_EVENT_COUNT) {
  const result = []
  for (let i = 0; i < count; i++) {
    const ev = spawnMapEvent(`mev${i}`)
    if (ev) result.push(ev)
  }
  return result
}

function formatCost(cost) {
  return Object.entries(cost ?? {})
    .map(([k, v]) => `${RESOURCE_NAMES[k] ?? k} ${v}`)
    .join(' · ')
}

function statusOf(node, { currentNodeId, conqueredNodeIds }) {
  if (node.id === currentNodeId) return 'current'
  if (conqueredNodeIds.includes(node.id)) return 'conquered'
  const accessible = new Set([currentNodeId, ...conqueredNodeIds])
  if ((node.connections ?? []).some((id) => accessible.has(id))) return 'reachable'
  return 'locked'
}

// 호버 툴팁용 — 세력 표시 (현재 구현된 적대 세력은 "보이드 군세" 단일 세력)
function factionOf(node, conqueredNodeIds) {
  return (node.role === 'home' || conqueredNodeIds.includes(node.id)) ? '인류 변경군 (아군 통제)' : '보이드 군세'
}

// 호버 툴팁용 — 보상 한 줄 요약 (정복 완료 시 이미 수령된 것으로 표시)
function briefReward(node, conquered) {
  if (conquered) return '수령 완료'
  const r = node?.reward
  if (!r) return '—'
  const parts = []
  if (r.resource) parts.push(Object.entries(r.resource).map(([k, v]) => `${RESOURCE_NAMES[k] ?? k} +${v}`).join(', '))
  if (r.ace) parts.push(`에이스 "${r.ace}" 합류`)
  if (r.aceCondition) parts.push('에이스 조건 보상')
  if (r.unlockShip) parts.push(`함선 "${r.unlockShip}" 해금`)
  if (r.ending) parts.push('엔딩')
  return parts.length ? parts.join(' · ') : '—'
}

// 호버 툴팁용 — 함대 위치 → 대상 별계까지 거리 기반 예상 이동 비용(AP, 표시 전용)
function moveApCost(fromPos, toPos) {
  const d = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y)
  return Math.max(1, Math.round(d / 10))
}

// 하단 액션바용 — 함대 핵심 정보(리더/전력/이동력/TP) 요약. 캐릭터성 강조를 위해
// 에이스가 배정된 함선 중 최고 레벨 함선을 "함대 리더"로 선정한다.
function getFleetSummary(roster, shipsData, acesData, skillsData) {
  if (!roster?.length || !shipsData) return null
  const withAce = roster.filter((e) => e.aceId)
  const leaderEntry = (withAce.length ? withAce : roster)
    .reduce((best, e) => (!best || e.level > best.level ? e : best), null)
  const leaderShip = shipsData.find((s) => s.id === leaderEntry?.shipId)
  const leaderAce  = acesData?.find((a) => a.id === leaderEntry?.aceId)
  const finisher   = skillsData?.find((sk) => sk.id === leaderAce?.finisher)

  // 전력 = Σ atk × √hp (handleSummaryBattle과 동일 공식, 레벨·성장치가 반영된 실전 스탯 사용)
  const power = roster.reduce((sum, e) => {
    const base = shipsData.find((s) => s.id === e.shipId)
    if (!base) return sum
    const eff = getEffectiveShip(base, e)
    return sum + (eff.atk ?? 10) * Math.sqrt(eff.hp ?? 50)
  }, 0)

  // 이동력 = 가장 느린 함선 기준(MOV 최솟값) — 함대는 가장 느린 함선에 맞춰 항해한다
  const movs = roster.map((e) => shipsData.find((s) => s.id === e.shipId)?.mov).filter(Boolean)
  const mov = movs.length ? Math.min(...movs) : null

  return {
    leaderName:  leaderShip?.name ?? '함선',
    aceName:     leaderAce?.name ?? null,
    level:       leaderEntry?.level ?? 1,
    power:       Math.round(power),
    mov,
    tpLabel:     finisher ? `${finisher.name} 대기` : '미보유',
  }
}

function genStars(n = 240) {
  return Array.from({ length: n }, () => ({
    x: Math.random(), y: Math.random(),
    r: Math.random() * 1.4 + 0.2,
    a: Math.random() * 0.55 + 0.12,
  }))
}

// 일반 호위 함대 1기를 행성 9~25% 반경에 배치
function spawnNearNode(ref, idBase) {
  const refPos = SYS_POS[ref.id]
  if (!refPos) return null
  for (let tries = 0; tries < 40; tries++) {
    const angle = Math.random() * Math.PI * 2
    const dist = 9 + Math.random() * 16
    const x = Math.max(3, Math.min(97, refPos.x + Math.cos(angle) * dist))
    const y = Math.max(3, Math.min(97, refPos.y + Math.sin(angle) * dist))
    if (tooCloseToSystem(x, y)) continue
    const threatLevel = ref.threatLevel ?? 1
    return { id: String(idBase), x, y, homeX: x, homeY: y, nodeRef: ref.id, threatLevel, passive: threatLevel <= PASSIVE_THREAT_LV, chasing: false, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2 }
  }
  return null
}

// 행성 중심 4~8% 반경(중앙의 보스와 일반 호위 사이)을 서성이는 준보스급 호위
function spawnEliteNearNode(ref, idBase) {
  const refPos = SYS_POS[ref.id]
  if (!refPos) return null
  const angle = Math.random() * Math.PI * 2
  const dist = 4 + Math.random() * 4
  const x = Math.max(3, Math.min(97, refPos.x + Math.cos(angle) * dist))
  const y = Math.max(3, Math.min(97, refPos.y + Math.sin(angle) * dist))
  return {
    id: String(idBase), x, y, homeX: x, homeY: y, nodeRef: ref.id,
    tier: 'elite',
    threatLevel: (ref.threatLevel ?? 1) + 2,
    passive: true, chasing: false,
    vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2,
  }
}

// 별계 위협 레벨에 따른 최소 유지 수 — 후반 별계일수록 더 많은 적이 상주
// 고위험 지역(threatLevel 4 이상)은 기존 대비 약 1.2배로 증원
function regularGuardCount(node) {
  const lv = node.threatLevel ?? 1
  const base = 5 + Math.floor((lv - 1) / 2) // 5~8기
  return lv >= 4 ? Math.round(base * 1.2) : base
}
function eliteGuardCount(node) {
  const lv = node.threatLevel ?? 1
  const base = lv >= 5 ? 3 : 2 // 2~3기
  return lv >= 4 ? Math.round(base * 1.2) : base
}

// 모항 안전지대 바로 바깥(반경 +2~+22%)에 배치되는 튜토리얼용 최약체 호위 함대
// nodeRef는 s1(아르카디아) 데이터를 그대로 재사용한다.
// 시작 지점 주변 체감 밀도를 위해 기존 대비 2배로 증원
const HOME_GUARD_COUNT = 12

function spawnHomeGuard(idBase) {
  for (let tries = 0; tries < 40; tries++) {
    const angle = Math.random() * Math.PI * 2
    const dist = HOME_SAFE_RADIUS + 2 + Math.random() * 20
    const x = Math.max(3, Math.min(97, HOME_POS.x + Math.cos(angle) * dist))
    const y = Math.max(3, Math.min(97, HOME_POS.y + Math.sin(angle) * dist))
    if (tooCloseToSystem(x, y)) continue
    return {
      id: String(idBase), x, y, homeX: x, homeY: y, nodeRef: 's1',
      homeGuard: true,
      threatLevel: 1,
      passive: true, chasing: false,
      vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5,
    }
  }
  return null
}

function genEnemies(systems, conqueredNodeIds = []) {
  if (!systems) return []
  const missionNodes = systems.filter(s => s.role !== 'home' && !conqueredNodeIds.includes(s.id))
  const result = []
  let idCounter = 0
  for (let i = 0; i < HOME_GUARD_COUNT; i++) {
    const guard = spawnHomeGuard(`e${idCounter++}`)
    if (guard) result.push(guard)
  }
  for (const ref of missionNodes) {
    for (let i = 0; i < regularGuardCount(ref); i++) {
      const enemy = spawnNearNode(ref, `e${idCounter++}`)
      if (enemy) result.push(enemy)
    }
    for (let i = 0; i < eliteGuardCount(ref); i++) {
      const enemy = spawnEliteNearNode(ref, `e${idCounter++}`)
      if (enemy) result.push(enemy)
    }
  }
  return result
}

// 별계 중앙에 고정된 보스 — 정복 전까지 행성을 직접 지키며, 접촉(행성 진입) 시 정복 전투 발동
function spawnSystemBoss(node) {
  const pos = SYS_POS[node.id]
  if (!pos) return null
  return { id: `boss_${node.id}`, x: pos.x, y: pos.y, nodeRef: node.id, threatLevel: node.threatLevel ?? 1 }
}

function genSystemBosses(systems, conqueredNodeIds = []) {
  return systems
    .filter(s => s.role !== 'home' && !conqueredNodeIds.includes(s.id))
    .map(spawnSystemBoss)
    .filter(Boolean)
}

export default function StrategyMapScreen({ onEnterBattle, onGameOver, onEnterPlace }) {
  // ─── 스토어 ───
  const systems          = useDataStore((s) => s.data?.systems?.systems)
  const enemyDefs        = useDataStore((s) => s.data?.enemies?.enemies)
  const bossDefs         = useDataStore((s) => s.data?.enemies?.bosses)
  const shipsData        = useDataStore((s) => s.data?.ships?.ships)
  const acesData         = useDataStore((s) => s.data?.aces?.aces)
  const skillsData       = useDataStore((s) => s.data?.skills?.skills)
  const eventsData       = useDataStore((s) => s.data?.events)
  const shopsData        = useDataStore((s) => s.data?.shops?.shops)
  const resources        = useDataStore((s) => s.data?.resources?.resources)
  const items            = useDataStore((s) => s.data?.items)
  const roster           = useFleetStore((s) => s.roster)
  const currentNodeId    = useProgressStore((s) => s.currentNodeId)
  const conqueredNodeIds = useProgressStore((s) => s.conqueredNodeIds)
  const moveTo           = useProgressStore((s) => s.moveTo)
  const canHarvest       = useProgressStore((s) => s.canHarvest)
  const harvest          = useProgressStore((s) => s.harvest)
  const harvestDev       = useProgressStore((s) => s.harvestDev)
  const miningDeposits   = useProgressStore((s) => s.miningDeposits)
  const obtainedHiddens  = useProgressStore((s) => s.obtainedHiddens)
  const isDeveloped      = useDevelopmentStore((s) => s.isDeveloped)
  const canDevelop       = useDevelopmentStore((s) => s.canDevelop)
  const develop          = useDevelopmentStore((s) => s.develop)
  const summaryBattle    = useSettingsStore((s) => s.summaryBattle)
  useDevelopmentStore((s) => s.developed)
  useResourceStore((s) => s.wallet)

  // ─── 캔버스 refs ───
  const canvasRef  = useRef(null)
  const rafRef     = useRef(null)
  const starsRef   = useRef(genStars())
  // bgImageRef: 배경 이미지(성운/우주 사진) — 로드 완료 후 RAF 루프가 자연스럽게 그리기 시작
  const bgImageRef = useRef(null)
  // drawFnRef: 매 렌더마다 최신 drawFrame을 가리킴 → RAF 루프가 재시작 없이 최신 상태 그림
  const drawFnRef  = useRef(null)
  // playerPosRef: 적 어그로 인터벌에서 재시작 없이 현재 위치를 읽기 위한 ref
  const playerPosRef = useRef({ ...SYS_POS.s0 })
  // eventModalRef: 모달 열림 여부를 인터벌 콜백에서 참조 (deps 없이)
  const eventModalRef = useRef(null)
  // battlePendingRef: 전투 진입 대기 여부를 키 입력 핸들러에서 참조 (deps 없이)
  const battlePendingRef = useRef(null)
  const pendingCategoryRef = useRef('space_normal') // battlePending 전투의 카테고리
  // summaryBattleRef: 근접 조우 useEffect에서 stale closure 없이 최신값 읽기 위한 ref
  const summaryBattleRef = useRef(summaryBattle)
  // 함대 자동 이동용 refs
  const fleetModeRef    = useRef('manual')
  const moveTargetRef   = useRef(null)
  const patrolCenterRef = useRef({ ...SYS_POS.s0 })
  const patrolAngleRef  = useRef(0)
  const handleAutoArrivalRef = useRef(() => {})

  // ─── 우주 이동 이벤트 추적 ───
  const lastEventPosRef  = useRef({ ...SYS_POS.s0 })
  const eventCooldownRef = useRef(0)

  // ─── 게임 상태 ───
  // 함대 좌표 — 전투/장소맵을 다녀오면 이 컴포넌트가 언마운트되므로,
  // 스토어(useProgressStore.fleetPos)에 보관된 마지막 위치에서 이어서 시작한다.
  const [playerPos,     setPlayerPos]     = useState(() => useProgressStore.getState().fleetPos ?? { ...SYS_POS.s0 })
  const [mapEnemies,    setMapEnemies]    = useState([])
  const [mapBosses,     setMapBosses]     = useState([])
  const [mapEvents,     setMapEvents]     = useState([])
  const [selectedId,    setSelectedId]    = useState(null)
  // hover: 캔버스 위에서 마우스가 올라가 있는 별계 노드 + 가벼운 툴팁 위치 정보 (클릭 상세 패널과 분리)
  const [hover,         setHover]         = useState(null)
  const [harvestMsg,    setHarvestMsg]    = useState(null)
  const [eventModal,    setEventModal]    = useState(null)
  const [alert,         setAlert]         = useState(null)
  const [battlePending, setBattlePending] = useState(null)
  // 함대 자동 이동 상태
  const [fleetMode,     setFleetMode]     = useState('manual') // 'manual' | 'moving' | 'patrolling'
  const [moveTarget,    setMoveTarget]    = useState(null)     // 목적지 별계 id

  // playerPos/eventModal → ref 동기화 (인터벌 콜백이 deps 없이 최신 상태 참조)
  // + 스토어 동기화: 화면 전환(언마운트)·저장 시에도 함대 위치가 보존되도록 매 변경마다 기록
  useEffect(() => {
    playerPosRef.current = playerPos
    useProgressStore.getState().setFleetPos(playerPos)
  }, [playerPos])
  useEffect(() => { eventModalRef.current = eventModal }, [eventModal])
  useEffect(() => { battlePendingRef.current = battlePending }, [battlePending])
  useEffect(() => { summaryBattleRef.current = summaryBattle }, [summaryBattle])
  useEffect(() => { fleetModeRef.current = fleetMode }, [fleetMode])
  useEffect(() => { moveTargetRef.current = moveTarget }, [moveTarget])
  useEffect(() => {
    handleAutoArrivalRef.current = (nodeId) => {
      const node = systems?.find(s => s.id === nodeId)
      if (node) handleMoveTo(node)
      setFleetMode('manual')
      setMoveTarget(null)
    }
  }) // 매 렌더마다 최신 클로저 유지

  // 배경 이미지 로드 (1회) — RAF 루프는 bgImageRef를 매 프레임 읽으므로 별도 상태 갱신 불필요
  useEffect(() => {
    const img = new Image()
    img.src = '/assets/bg_space.jpg'
    img.onload = () => { bgImageRef.current = img }
  }, [])

  // 적 초기화 (systems 로드 후 1회, 이미 정복된 별계는 제외)
  useEffect(() => {
    if (systems && mapEnemies.length === 0) {
      setMapEnemies(genEnemies(systems, conqueredNodeIds))
    }
  }, [systems]) // eslint-disable-line react-hooks/exhaustive-deps

  // 별계 수호 보스 초기화 (systems 로드 후 1회, 이미 정복된 별계는 제외)
  useEffect(() => {
    if (systems && mapBosses.length === 0) {
      setMapBosses(genSystemBosses(systems, conqueredNodeIds))
    }
  }, [systems]) // eslint-disable-line react-hooks/exhaustive-deps

  // 정복된 별계의 수호 보스는 즉시 제거
  useEffect(() => {
    setMapBosses(prev => prev.filter(b => !conqueredNodeIds.includes(b.nodeRef)))
  }, [conqueredNodeIds])

  // ─── 적 이동 (0.4초마다) — 어그로 범위 내 플레이어 추격, 이탈 시 귀환, 그 외 순찰 ───
  // passive(저레벨 비호전적) 적은 추격을 시작하지 않고 항상 순찰만 함.
  // 플레이어가 모항 안전지대 안에 있으면 어떤 적도 추격을 시작/유지하지 못하고,
  // repelHome이 모든 적의 모항 안전지대 진입을 막는다(반사).
  useEffect(() => {
    if (!systems) return
    const AGGRO_DIST = 14   // 이 거리 이내로 플레이어가 오면 추격 시작
    const LEASH_DIST = 26   // 홈에서 이 거리 이상 멀어지면 추격 포기 · 귀환
    const id = setInterval(() => {
      // 모달(전투 결과/이벤트)이 열려 있는 동안은 적 이동 전부 정지 — 모달 닫기 전 조우 방지
      if (eventModalRef.current) return
      const pp = playerPosRef.current
      const playerSafe = Math.hypot(pp.x - HOME_POS.x, pp.y - HOME_POS.y) < HOME_SAFE_RADIUS
      setMapEnemies(prev => prev.map(e => {
        const homeX = e.homeX ?? e.x
        const homeY = e.homeY ?? e.y
        const dPlayer = Math.hypot(e.x - pp.x, e.y - pp.y)
        const dHome   = Math.hypot(e.x - homeX, e.y - homeY)

        let chasing = e.chasing ?? false
        if (!e.passive && !playerSafe && !chasing && dPlayer < AGGRO_DIST) chasing = true
        if (chasing && (dHome > LEASH_DIST || playerSafe)) chasing = false

        if (chasing) {
          // 플레이어 방향으로 빠르게 이동
          const dx = pp.x - e.x, dy = pp.y - e.y
          const len = Math.hypot(dx, dy) || 1
          const spd = 4.2
          return repelHome({ ...e, x: Math.max(2, Math.min(98, e.x + dx/len*spd)), y: Math.max(2, Math.min(98, e.y + dy/len*spd)), vx: dx/len*spd, vy: dy/len*spd, chasing, homeX, homeY })
        }

        if (dHome > 5) {
          // 홈 포인트로 귀환
          const dx = homeX - e.x, dy = homeY - e.y
          const len = Math.hypot(dx, dy) || 1
          const spd = 2.5
          return repelHome({ ...e, x: Math.max(2, Math.min(98, e.x + dx/len*spd)), y: Math.max(2, Math.min(98, e.y + dy/len*spd)), vx: dx/len*spd, vy: dy/len*spd, chasing: false, homeX, homeY })
        }

        // 홈 근처 순찰 드리프트
        const nvx = e.vx + (Math.random() - 0.5) * 0.5
        const nvy = e.vy + (Math.random() - 0.5) * 0.5
        const spd2 = Math.hypot(nvx, nvy)
        const vx = spd2 > 2.5 ? nvx/spd2*2.5 : nvx
        const vy = spd2 > 2.5 ? nvy/spd2*2.5 : nvy
        const nx = Math.max(2, Math.min(98, e.x + vx))
        const ny = Math.max(2, Math.min(98, e.y + vy))
        // 홈에서 너무 멀어지면 되돌리기
        if (Math.hypot(nx - homeX, ny - homeY) > 11) {
          const dx = homeX - e.x, dy = homeY - e.y
          const len = Math.hypot(dx, dy) || 1
          return repelHome({ ...e, x: Math.max(2, Math.min(98, e.x + dx/len*1.8)), y: Math.max(2, Math.min(98, e.y + dy/len*1.8)), vx: dx/len*2, vy: dy/len*2, chasing: false, homeX, homeY })
        }
        // 다른 별계(자기 자신 제외)와 너무 가까워지면 바운스
        for (const [key, pos] of Object.entries(SYS_POS)) {
          if (key === e.nodeRef) continue
          if (Math.hypot(nx - pos.x, ny - pos.y) < 8) {
            return repelHome({ ...e, x: e.x - vx*0.5, y: e.y - vy*0.5, vx: -vx*0.9, vy: -vy*0.9, chasing: false, homeX, homeY })
          }
        }
        return repelHome({ ...e, x: nx, y: ny, vx, vy, chasing: false, homeX, homeY })
      }))
    }, 400)
    return () => clearInterval(id)
  }, [systems]) // playerPos는 playerPosRef로 참조하므로 deps 불필요

  // ─── 적 호위 함대 리스폰 (10초마다) — 모항 튜토리얼 호위 → 별계별 최소 유지 수(일반 호위 → 준보스급 순)를 우선 보충 ───
  useEffect(() => {
    if (!systems) return
    const missionNodes = systems.filter(s => s.role !== 'home')
    const interval = setInterval(() => {
      setMapEnemies(prev => {
        const active = missionNodes.filter(n => !conqueredNodeIds.includes(n.id))
        const totalQuota = HOME_GUARD_COUNT + active.reduce((sum, n) => sum + regularGuardCount(n) + eliteGuardCount(n), 0)
        if (prev.length >= totalQuota) return prev

        const homeGuardCount = prev.filter(e => e.homeGuard).length
        if (homeGuardCount < HOME_GUARD_COUNT) {
          const guard = spawnHomeGuard(`e${Date.now()}`)
          return guard ? [...prev, guard] : prev
        }

        const regCounts = {}, eliteCounts = {}
        prev.forEach(e => {
          const counts = e.tier === 'elite' ? eliteCounts : regCounts
          counts[e.nodeRef] = (counts[e.nodeRef] ?? 0) + 1
        })

        const understaffedReg = active.filter(n => (regCounts[n.id] ?? 0) < regularGuardCount(n))
        if (understaffedReg.length > 0) {
          const enemy = spawnNearNode(pickNodeWeighted(understaffedReg), `e${Date.now()}`)
          return enemy ? [...prev, enemy] : prev
        }
        const understaffedElite = active.filter(n => (eliteCounts[n.id] ?? 0) < eliteGuardCount(n))
        if (understaffedElite.length > 0) {
          const enemy = spawnEliteNearNode(pickNodeWeighted(understaffedElite), `e${Date.now()}`)
          return enemy ? [...prev, enemy] : prev
        }
        return prev
      })
    }, 10000)
    return () => clearInterval(interval)
  }, [systems, conqueredNodeIds])

  // ─── 맵 이벤트 요소(상인·표류 함선) 초기화 (systems 로드 후 1회) ───
  useEffect(() => {
    if (systems && mapEvents.length === 0) {
      setMapEvents(genMapEvents())
    }
  }, [systems]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 맵 이벤트 요소 드리프트 (0.5초마다) — 천천히 배회, 별계/모항 안전지대·화면 경계에서 반사 ───
  useEffect(() => {
    if (!systems) return
    const id = setInterval(() => {
      if (eventModalRef.current) return
      setMapEvents(prev => prev.map(ev => {
        let nvx = ev.vx + (Math.random() - 0.5) * 0.3
        let nvy = ev.vy + (Math.random() - 0.5) * 0.3
        const spd = Math.hypot(nvx, nvy)
        if (spd > 0.8) { nvx = nvx / spd * 0.8; nvy = nvy / spd * 0.8 }
        let nx = Math.max(3, Math.min(97, ev.x + nvx))
        let ny = Math.max(3, Math.min(97, ev.y + nvy))
        if (nx <= 3 || nx >= 97) nvx = -nvx
        if (ny <= 3 || ny >= 97) nvy = -nvy
        if (tooCloseToSystem(nx, ny)) {
          nvx = -nvx; nvy = -nvy
          nx = ev.x; ny = ev.y
        }
        return { ...ev, x: nx, y: ny, vx: nvx, vy: nvy }
      }))
    }, 500)
    return () => clearInterval(id)
  }, [systems])

  // ─── 맵 이벤트 요소 리스폰 (12초마다 최대 개수까지 보충) ───
  useEffect(() => {
    if (!systems) return
    const interval = setInterval(() => {
      setMapEvents(prev => {
        if (prev.length >= MAP_EVENT_COUNT) return prev
        const ev = spawnMapEvent(`mev${Date.now()}`)
        return ev ? [...prev, ev] : prev
      })
    }, 12000)
    return () => clearInterval(interval)
  }, [systems])

  // ─── 함대 자동 이동 (200ms마다) — moving: 목적지 직선 추진 / patrolling: 현 위치 궤도 순찰 ───
  useEffect(() => {
    const id = setInterval(() => {
      if (eventModalRef.current) return
      const mode = fleetModeRef.current
      if (mode === 'moving') {
        const target = moveTargetRef.current
        if (!target) return
        const targetPos = SYS_POS[target]
        if (!targetPos) return
        setPlayerPos(p => {
          const dx = targetPos.x - p.x
          const dy = targetPos.y - p.y
          const dist = Math.hypot(dx, dy)
          if (dist < 1.5) {
            handleAutoArrivalRef.current(target)
            return { x: Math.max(0, Math.min(100, targetPos.x)), y: Math.max(0, Math.min(100, targetPos.y)) }
          }
          const speed = 2.0
          return {
            x: Math.max(0, Math.min(100, p.x + (dx / dist) * speed)),
            y: Math.max(0, Math.min(100, p.y + (dy / dist) * speed)),
          }
        })
      } else if (mode === 'patrolling') {
        patrolAngleRef.current += 0.08
        const cx = patrolCenterRef.current.x
        const cy = patrolCenterRef.current.y
        setPlayerPos({
          x: Math.max(0, Math.min(100, cx + Math.cos(patrolAngleRef.current) * 4)),
          y: Math.max(0, Math.min(100, cy + Math.sin(patrolAngleRef.current) * 4)),
        })
      }
    }, 200)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 전투 딜레이 처리 ───
  useEffect(() => {
    if (!battlePending) return
    const t = setTimeout(() => {
      onEnterBattle(battlePending, pendingCategoryRef.current)
      setBattlePending(null)
    }, 600)
    return () => clearTimeout(t)
  }, [battlePending, onEnterBattle])

  // ─── 근접 조우 판정 ───
  // mapEnemies deps 포함: 어그로 추격 중 적이 플레이어에게 접근할 때도 트리거되어야 함.
  // eventModal 가드 필수: 모달이 열려 있는 동안 mapEnemies 업데이트(400ms 이동)로 effect가
  // 재실행되면서 handleSummaryBattle이 중복 호출되어 상태가 꼬이는 것을 방지.
  useEffect(() => {
    if (!systems || battlePending || eventModal) return

    const inHomeSafeZone = Math.hypot(playerPos.x - HOME_POS.x, playerPos.y - HOME_POS.y) < HOME_SAFE_RADIUS

    // 적 함대 — ENCOUNTER_DIST 이내 직접 접촉 시 전투 (모항 안전지대에서는 전투 불가)
    if (!inHomeSafeZone) {
      const hit = mapEnemies.find(e =>
        Math.hypot(e.x - playerPos.x, e.y - playerPos.y) < ENCOUNTER_DIST
      )
      if (hit) {
        setMapEnemies(prev => prev.filter(e => e.id !== hit.id))
        if (summaryBattleRef.current) {
          handleSummaryBattle(hit.nodeRef, false)
        } else {
          showAlert('⚔️ 적 함대 발견! 전투 개시!')
          pendingCategoryRef.current = hit.tier === 'elite' ? 'space_elite' : 'space_normal'
          setBattlePending(hit.nodeRef)
        }
        return
      }
    }

    // 별계 수호 보스 — 접촉 시 정복 전투 발동 (모항 안전지대에서는 발생하지 않음)
    if (!inHomeSafeZone) {
      const bossHit = mapBosses.find(b =>
        Math.hypot(b.x - playerPos.x, b.y - playerPos.y) < ENCOUNTER_DIST
      )
      if (bossHit) {
        if (summaryBattleRef.current) {
          handleSummaryBattle(bossHit.nodeRef, true)
        } else {
          const node = systems.find(s => s.id === bossHit.nodeRef)
          showAlert(`👹 ${node?.name ?? '별계'} 수호자와 조우! 정복 전투 개시!`)
          pendingCategoryRef.current = 'planet_boss'
          setBattlePending(bossHit.nodeRef)
        }
        return
      }
    }

    // 맵 이벤트 요소(상인·표류 함선) — ENCOUNTER_DIST 이내 접촉 시 이벤트 발동
    const evHit = mapEvents.find(ev =>
      Math.hypot(ev.x - playerPos.x, ev.y - playerPos.y) < ENCOUNTER_DIST
    )
    if (evHit) {
      setMapEvents(prev => prev.filter(ev => ev.id !== evHit.id))
      triggerMapEvent(evHit)
      return
    }

    // 별계 — SYSTEM_DIST 이내 접근 시 우측 패널 자동 표시
    let nearest = null, nearestD = SYSTEM_DIST
    for (const sys of systems) {
      const pos = SYS_POS[sys.id]
      if (!pos) continue
      const d = Math.hypot(pos.x - playerPos.x, pos.y - playerPos.y)
      if (d < nearestD) { nearestD = d; nearest = sys }
    }
    if (nearest) {
      setSelectedId(nearest.id)
      moveTo(nearest.id)
    }
  }, [playerPos, mapEnemies, mapBosses, mapEvents, systems, battlePending, eventModal]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 키보드 이동 + 자동항행 취소(Space) ───
  useEffect(() => {
    const STEP = 1.5
    function onKey(e) {
      // Enter: 이벤트 모달 닫기
      if (e.key === 'Enter') {
        if (eventModalRef.current) { e.preventDefault(); setEventModal(null) }
        return
      }
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        // Space: 자동 이동/정찰 모드 취소
        fleetModeRef.current = 'manual'
        setFleetMode('manual')
        setMoveTarget(null)
        return
      }
      // 모달(이벤트 결과 등)이 떠 있거나 전투 진입 대기 중이면 함대 이동 불가
      if (eventModalRef.current || battlePendingRef.current) return
      let dx = 0, dy = 0
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': dy = -STEP; break
        case 'ArrowDown':  case 's': case 'S': dy =  STEP; break
        case 'ArrowLeft':  case 'a': case 'A': dx = -STEP; break
        case 'ArrowRight': case 'd': case 'D': dx =  STEP; break
        default: return
      }
      e.preventDefault()
      // WASD/화살표: 자동항행 취소 후 수동 이동
      fleetModeRef.current = 'manual'
      setFleetMode('manual')
      setMoveTarget(null)
      setPlayerPos(p => ({
        x: Math.max(0, Math.min(100, p.x + dx)),
        y: Math.max(0, Math.min(100, p.y + dy)),
      }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 캔버스 좌표(px) 위치에서 NODE_HIT_RADIUS 이내의 별계 노드를 찾는다 (호버/클릭 공용)
  function findNodeAt(mx, my, rect) {
    return systems.find(sys => {
      const pos = SYS_POS[sys.id]
      if (!pos) return false
      const px = pos.x / 100 * rect.width
      const py = pos.y / 100 * rect.height
      return Math.hypot(px - mx, py - my) < NODE_HIT_RADIUS
    }) ?? null
  }

  // ─── 마우스 클릭 → 별계 노드 클릭 시 상세 패널 표시, 그 외(빈 공간)에는 선택 해제만 (함대 이동은 방향키/WASD 전용) ───
  function handleCanvasClick(e) {
    if (battlePending) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const hit = findNodeAt(mx, my, rect)
    if (hit) {
      setSelectedId(hit.id)
      return
    }

    // 빈 공간 클릭 — 선택 해제(하단 액션바 닫힘)
    setSelectedId(null)
  }

  // ─── 마우스 호버 → 별계 노드 위에 있으면 가벼운 요약 툴팁 표시 ───
  function handleCanvasMouseMove(e) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const hit = findNodeAt(mx, my, rect)
    if (!hit) {
      if (hover) setHover(null)
      return
    }
    setHover({ id: hit.id, x: mx, y: my, w: rect.width, h: rect.height })
  }

  function handleCanvasMouseLeave() {
    setHover(null)
  }

  // ─── 알림 헬퍼 ───
  function showAlert(msg) {
    setAlert(msg)
    setTimeout(() => setAlert(null), 3500)
  }
  function showHarvestMsg(msg) {
    setHarvestMsg(msg)
    setTimeout(() => setHarvestMsg(null), 4000)
  }

  // ─── 캔버스 그리기 (RAF 루프가 drawFnRef.current()로 호출) ───
  // 이 함수는 매 렌더에 재정의되지만, drawFnRef를 통해 항상 최신 값을 읽음.
  // RAF 루프 자체는 재시작하지 않으므로 깜빡임 없음.
  function drawFrame() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    if (W === 0 || H === 0) return
    const t = Date.now() * 0.002

    ctx.fillStyle = '#060a1c'
    ctx.fillRect(0, 0, W, H)

    // 배경 이미지(성운/우주 사진) — 로드 완료 시 캔버스 전체를 cover-fit으로 채움
    const bg = bgImageRef.current
    if (bg) {
      const scale = Math.max(W / bg.width, H / bg.height)
      const dw = bg.width * scale, dh = bg.height * scale
      ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh)
    } else {
      // 이미지 로드 전 폴백 — 배경 별
      starsRef.current.forEach(s => {
        ctx.fillStyle = `rgba(255,255,255,${s.a})`
        ctx.beginPath()
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2)
        ctx.fill()
      })

      // 성운 효과
      const neb = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, W * 0.45)
      neb.addColorStop(0, 'rgba(80,40,160,0.07)')
      neb.addColorStop(1, 'rgba(10,20,60,0)')
      ctx.fillStyle = neb
      ctx.fillRect(0, 0, W, H)
    }

    // 채굴 가능(매장량 잔존)한 별계의 단색 자원 아이콘 — 글로우 없이 작게만 표시
    function pickMiningIcon(sys) {
      if (sys.mining) {
        const rem = miningDeposits[sys.id] ?? sys.mining.deposit
        if (rem > 0) return RESOURCE_ICONS[sys.mining.resource] ?? '⛏'
      }
      if (sys.devMining && isDeveloped(sys.id)) {
        const rem = miningDeposits[sys.id + '_dev'] ?? sys.devMining.deposit
        if (rem > 0) return RESOURCE_ICONS[sys.devMining.resource] ?? '⛏'
      }
      return null
    }

    // 별계 — 역할별 시각 계층(HUD/GUI 분리):
    // 1) 영역(정복 지역) — 얇은 시안 점선 + 옅은 채움  2) 목표(점령 가능) — 골드 링 + 은은한 글로우
    // 3) 위험(수호 보스 잔존) — 레드 링            4) 현재 위치 — 시안+골드 복합 링
    // 5) 선택 — 가장 강한 골드 링 + 그림자(하단 액션바·우측 정보패널과 연동)
    // → 과도한 개별 글로우 대신, 의미별로 링/배지/채움을 한 가지씩만 사용해 정보 밀도를 낮춘다.
    systems?.forEach(sys => {
      const pos = SYS_POS[sys.id]
      if (!pos) return
      const px = pos.x / 100 * W
      const py = pos.y / 100 * H
      const isCurr = sys.id === currentNodeId
      const isConq = conqueredNodeIds.includes(sys.id)
      const isSel  = sys.id === selectedId
      const status = statusOf(sys, { currentNodeId, conqueredNodeIds })
      const boss   = mapBosses.find(b => b.nodeRef === sys.id)

      // 1) 영역 — 정복 지역(내 세력): 얇은 시안 점선 + 옅은 채움 (모항은 안전지대 반경을 영역으로 사용)
      if (isConq) {
        const r = sys.role === 'home' ? HOME_SAFE_RADIUS / 100 * W : 108
        ctx.fillStyle = 'rgba(58,214,196,0.05)'
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(58,214,196,0.3)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 5])
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // 2) 목표 — 점령 가능(다음 진입 목표): 골드 링 + 은은한 글로우
      if (status === 'reachable') {
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 96)
        glow.addColorStop(0, 'rgba(255,209,102,0.14)')
        glow.addColorStop(1, 'rgba(255,209,102,0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(px, py, 96, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = `rgba(255,209,102,${0.5 + Math.sin(t * 1.5) * 0.15})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(px, py, 96, 0, Math.PI * 2)
        ctx.stroke()
      }

      // 3) 위험 — 수호 보스가 남아있고 진입 가능/현재 위치인 별계는 레드 링으로 강조 (잠긴 별계는 생략)
      if (boss && status !== 'locked' && !isConq) {
        ctx.strokeStyle = `rgba(220,38,38,${0.5 + Math.sin(t * 1.5) * 0.15})`
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(px, py, 116, 0, Math.PI * 2)
        ctx.stroke()
      }

      // 4) 현재 위치 — 시안+골드 복합 강조 (안쪽 시안 실선 + 바깥 골드 점선 + 옅은 시안 글로우)
      if (isCurr) {
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 120)
        glow.addColorStop(0, 'rgba(58,214,196,0.28)')
        glow.addColorStop(1, 'rgba(58,214,196,0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(px, py, 120, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = '#3ad6c4'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(px, py, 84, 0, Math.PI * 2)
        ctx.stroke()

        ctx.strokeStyle = 'rgba(255,209,102,0.85)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([3, 4])
        ctx.beginPath()
        ctx.arc(px, py, 100, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // 5) 선택 — 가장 강한 외곽선 + 그림자 (하단 액션바·우측 정보패널과 연동되는 노드)
      if (isSel) {
        ctx.save()
        ctx.shadowColor = 'rgba(255,236,179,0.9)'
        ctx.shadowBlur = 16
        ctx.strokeStyle = '#ffd166'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(px, py, 128, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      // 노드 아이콘 — 행성 이미지를 먼저 그리고, 잠긴 별계는 옅게 표시해 정보 밀도를 낮춘다
      // 모항(🏠) 아이콘은 같은 폰트 크기에서도 다른 행성(🪐)보다 시각적으로 커 보이므로 축소
      ctx.font = sys.role === 'home' ? '74px Arial' : '104px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.globalAlpha = status === 'locked' ? 0.4 : 1
      ctx.fillText(ROLE_ICON[sys.role] ?? '🪐', px, py)

      // 수호 보스 — 행성 이미지 위에 중심 정렬로 오버레이 표시(미정복 시).
      // mapBosses의 좌표가 곧 이 중심점이므로, 이 위치 = 정복 전투 발동 지점이 된다.
      // 일반 적 아이콘(👾🛸💀)과 비슷한 크기로 표시해, 행성 자체로 오인되지 않도록 한다.
      if (boss && sys.role !== 'boss') {
        const bossSize = 28 + (boss.threatLevel ?? 1) * 1.5
        const bossGlowR = bossSize * 0.9
        const bossGlow = ctx.createRadialGradient(px, py, 0, px, py, bossGlowR)
        bossGlow.addColorStop(0, `rgba(${threatColorRgb(boss.threatLevel)},0.4)`)
        bossGlow.addColorStop(1, `rgba(${threatColorRgb(boss.threatLevel)},0)`)
        ctx.fillStyle = bossGlow
        ctx.beginPath()
        ctx.arc(px, py, bossGlowR, 0, Math.PI * 2)
        ctx.fill()

        ctx.font = `${bossSize}px Arial`
        ctx.fillText('👹', px, py)
      }
      ctx.globalAlpha = 1

      // 이름 라벨 — 현재=시안, 정복 지역=시안 계열, 목표(점령 가능)=골드, 그 외(잠김)=무채색
      ctx.font = 'bold 14px sans-serif'
      ctx.fillStyle = isCurr ? '#3ad6c4' : isConq ? '#7cd6e8' : status === 'reachable' ? '#ffd166' : '#777'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(sys.name, px, py + 68)

      // 부가 자원/채굴지 — 작은 단색 아이콘 1개만 (글로우 없음)
      const miningIcon = pickMiningIcon(sys)
      if (miningIcon) {
        ctx.font = '32px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(miningIcon, px - 56, py - 56)
      }
    })

    // 적 함대 — 위협도(레벨)는 글로우 색상, 위협도+준보스 여부(규모)는 글로우/아이콘 크기로 구분.
    // 어그로 추격 중일 때만 빨간 링, 준보스급(elite)은 비추격 시 옅은 주황 링을 추가로 표시.
    mapEnemies.forEach(enemy => {
      const tier = enemy.threatLevel ?? 1
      const isElite = enemy.tier === 'elite'
      const isChasing = enemy.chasing ?? false
      const ex = enemy.x / 100 * W
      const ey = enemy.y / 100 * H
      const size = (isElite ? 20 : 14) + tier * 1.3

      const glowR = size * 1.7
      const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, glowR)
      glow.addColorStop(0, `rgba(${threatColorRgb(tier)},0.35)`)
      glow.addColorStop(1, `rgba(${threatColorRgb(tier)},0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(ex, ey, glowR, 0, Math.PI * 2)
      ctx.fill()

      if (isChasing) {
        ctx.strokeStyle = `rgba(220,38,38,${0.6 + Math.sin(t * 4) * 0.2})`
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(ex, ey, size + 6, 0, Math.PI * 2)
        ctx.stroke()
      } else if (isElite) {
        ctx.strokeStyle = 'rgba(255,140,0,0.4)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(ex, ey, size + 4, 0, Math.PI * 2)
        ctx.stroke()
      }

      const emoji = isElite ? '🛸' : tier >= 6 ? '💀' : tier >= 4 ? '🛸' : '👾'
      ctx.font = `${(isElite ? 22 : 16) + tier * 1.5}px Arial`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(emoji, ex, ey)
    })

    // 맵 이벤트 요소 — 떠돌이 상인/표류 함선 (글로우 대신 아이콘 + 작은 단색 점으로 표시)
    mapEvents.forEach(ev => {
      const exx = ev.x / 100 * W
      const eyy = ev.y / 100 * H
      const dot = MAP_EVENT_GLOW[ev.type] ?? 'rgba(255,255,255,'

      ctx.font = '18px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(MAP_EVENT_ICON[ev.type] ?? '✨', exx, eyy)

      ctx.fillStyle = `${dot}0.8)`
      ctx.beginPath()
      ctx.arc(exx, eyy + 14, 2, 0, Math.PI * 2)
      ctx.fill()
    })

    // 플레이어 우주선 — 시안+골드 복합 강조(현재 위치와 동일한 톤): 옅은 골드 글로우 + 얇은 시안 링
    const ppx = playerPos.x / 100 * W
    const ppy = playerPos.y / 100 * H
    const pg = ctx.createRadialGradient(ppx, ppy, 0, ppx, ppy, 26)
    pg.addColorStop(0, 'rgba(255,209,102,0.4)')
    pg.addColorStop(1, 'rgba(255,209,102,0)')
    ctx.fillStyle = pg
    ctx.beginPath()
    ctx.arc(ppx, ppy, 26, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgba(58,214,196,0.7)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(ppx, ppy, 21, 0, Math.PI * 2)
    ctx.stroke()

    ctx.font = '36px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🚀', ppx, ppy)

    // 함대 자동항행 상태 시각화
    if (fleetMode === 'moving' && moveTarget) {
      const tp = SYS_POS[moveTarget]
      if (tp) {
        const tx = tp.x / 100 * W, ty = tp.y / 100 * H
        ctx.save()
        ctx.strokeStyle = 'rgba(58,214,196,0.55)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 8])
        ctx.beginPath()
        ctx.moveTo(ppx, ppy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.font = '22px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('📍', tx, ty - 28)
        ctx.restore()
      }
    } else if (fleetMode === 'patrolling') {
      const cx = patrolCenterRef.current.x / 100 * W
      const cy = patrolCenterRef.current.y / 100 * H
      const r  = 4 / 100 * Math.min(W, H) * 1.35
      ctx.save()
      ctx.strokeStyle = 'rgba(255,209,102,0.45)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 6])
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }

    // 조작 안내
    ctx.font = '11px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('방향키/WASD로 이동 · 👾🛸 호위 함대 접촉 시 전투 · 👹 행성(보스) 진입 시 정복전투 · 🛒🛰️ 접촉 시 이벤트 · 모항 주변은 안전지대', 8, H - 6)
  }
  // 매 렌더마다 최신 함수로 갱신 (RAF 루프는 재시작 안 함)
  drawFnRef.current = drawFrame

  // ─── RAF 루프 (단 한 번만 시작, state 변경 시 재시작 없음 → 깜빡임 없음) ───
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 최초 1회 크기 설정
    canvas.width  = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    function loop() {
      drawFnRef.current?.()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    // 창 크기가 실제로 바뀔 때만 canvas 크기 재설정 (불필요한 clear 방지)
    const ro = new ResizeObserver(() => {
      const c = canvasRef.current
      if (!c) return
      const w = c.offsetWidth, h = c.offsetHeight
      if (c.width !== w || c.height !== h) {
        c.width  = w
        c.height = h
      }
    })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, []) // ← 빈 deps: RAF 루프는 mount 시 한 번만 시작

  if (!systems) return null

  // ─── 우측 정보 패널 ───
  const byId      = new Map(systems.map((n) => [n.id, n]))
  const enemyById = new Map((enemyDefs ?? []).map((e) => [e.id, e]))
  const bossById  = new Map((bossDefs  ?? []).map((b) => [b.id, b]))
  const selected  = byId.get(selectedId) ?? byId.get(currentNodeId)
  const itemsById = items
    ? new Map(['weapons','modules','consumables','uniques'].flatMap((c) => items[c] ?? []).map((i) => [i.id, i]))
    : new Map()

  // ─── 하단 액션바: 명시적으로 클릭/근접 선택된 노드가 있을 때만 표시 (선택 해제 시 숨김) ───
  const barTarget   = byId.get(selectedId) ?? null
  const barStatus   = barTarget ? statusOf(barTarget, { currentNodeId, conqueredNodeIds }) : null
  const fleetSummary = getFleetSummary(roster, shipsData, acesData, skillsData)

  function enemyName(id) {
    return enemyById.get(id)?.name ?? bossById.get(id)?.name ?? id
  }

  function getMiningInfo(node) {
    const lines = []
    if (node?.mining) {
      const rem  = miningDeposits[node.id] ?? node.mining.deposit
      const name = RESOURCE_NAMES[node.mining.resource] ?? node.mining.resource
      const dev  = isDeveloped(node.id)
      const eff  = dev && node.mining.devYieldBonus ? node.mining.yield + node.mining.devYieldBonus : node.mining.yield ?? '?'
      lines.push(rem <= 0
        ? `⛏ ${name} 채굴 — 매장량 고갈`
        : `⛏ ${name} 채굴 · +${eff}/방문 (잔여 ${rem}/${node.mining.deposit})`)
    }
    if (node?.devMining && isDeveloped(node.id)) {
      const key  = node.id + '_dev'
      const rem  = miningDeposits[key] ?? node.devMining.deposit
      const name = RESOURCE_NAMES[node.devMining.resource] ?? node.devMining.resource
      lines.push(rem <= 0
        ? `⛏ 채굴장 ${name} — 고갈`
        : `⛏ 채굴장 ${name} · +${node.devMining.yield}/방문 (잔여 ${rem}/${node.devMining.deposit})`)
    }
    return lines.length ? lines.join('\n') : null
  }

  function handleMoveTo(node) {
    moveTo(node.id)
    const devDone = isDeveloped(node.id)
    if (canHarvest(node)) {
      const result = harvest(node, devDone)
      if (result) {
        const name   = RESOURCE_NAMES[result.resource] ?? result.resource
        const bonus  = devDone && node.mining?.devYieldBonus ? ' (+개발 보너스)' : ''
        const depMsg = result.remaining === 0 ? ' — 매장량 고갈!' : ` (잔여 ${result.remaining})`
        showHarvestMsg(`⛏ ${node.name} 채굴: ${name} +${result.amount}${bonus}${depMsg}`)
      }
    }
    if (devDone && node.devMining) {
      const result = harvestDev(node)
      if (result) {
        const name   = RESOURCE_NAMES[result.resource] ?? result.resource
        const depMsg = result.remaining === 0 ? ' — 매장량 고갈!' : ` (잔여 ${result.remaining})`
        showHarvestMsg(`⛏ ${node.name} 채굴장: ${name} +${result.amount}${depMsg}`)
      }
    }
  }

  function handleDevelop(node) {
    if (develop(node, conqueredNodeIds.includes(node.id))) {
      showHarvestMsg(`🏗 "${node.dev.name}" 완료! ${node.dev.desc}`)
    }
  }

  function handleEnterNode(node) {
    const cat = node.miniboss ? 'planet_boss' : 'planet_normal'
    if (!eventsData?.eventWeights) {
      if (summaryBattle) { handleSummaryBattle(node.id, true); return }
      onEnterBattle(node.id, cat); return
    }
    const type = pickEventType(eventsData.eventWeights)
    if (type === 'battle') {
      if (summaryBattle) { handleSummaryBattle(node.id, true); return }
      onEnterBattle(node.id, cat); return
    }
    if (type === 'resource') {
      const { resourceId, resourceName, amount } = buildResourceEvent(resources ?? [])
      useResourceStore.getState().earn({ [resourceId]: amount })
      setEventModal({ title: '🪐 항해 중 발견', body: `${resourceName} ${amount}개를 획득했습니다!`, shop: null })
      return
    }
    if (type === 'peace') {
      setEventModal({ title: '😌 평화로운 항해', body: PEACE_MESSAGES[Math.floor(Math.random() * PEACE_MESSAGES.length)], shop: null })
      return
    }
    if (type === 'scout') {
      setEventModal({ title: '🔭 정찰 성공', body: '정찰대가 항로를 사전 조사했습니다.\n다음 전투에서 선제 공격 기회를 노릴 수 있습니다.', shop: null })
      return
    }
    if (type === 'special') {
      const special = pickSpecialEvent(eventsData.specialEvents ?? [])
      const effects = []
      const wallet  = useResourceStore.getState().wallet
      if (special.reward) {
        const re = extractResourceEffect(special.reward)
        if (re) {
          useResourceStore.getState().earn(re)
          effects.push(`획득: ${Object.entries(re).map(([k,v])=>`${RESOURCE_NAMES[k]??k} +${v}`).join(' · ')}`)
        }
      }
      if (special.penalty) {
        const re = extractResourceEffect(special.penalty)
        if (re) {
          const loss = Object.fromEntries(Object.entries(re).map(([k,v]) => [k, Math.min(v, wallet[k]??0)]))
          useResourceStore.getState().earn(Object.fromEntries(Object.entries(loss).map(([k,v]) => [k,-v])))
          effects.push(`손실: ${Object.entries(loss).map(([k,v])=>`${RESOURCE_NAMES[k]??k} -${v}`).join(' · ')}`)
        }
      }
      const shop = special.shop ? (shopsData ?? []).find((s) => s.id === special.shop) ?? null : null
      setEventModal({ title: `✨ ${special.name}`, body: [special.msg, ...effects].filter(Boolean).join('\n'), shop })
    }
  }

  // ─── 액션바 "정찰" — 전투 없이 별계 정보를 정찰 보고서로 요약 (가벼운 알림) ───
  function handleScout(node) {
    const status = statusOf(node, { currentNodeId, conqueredNodeIds })
    if (status === 'locked') {
      const need = (node.connections ?? []).filter((id) => id !== currentNodeId && !conqueredNodeIds.includes(id))
      const names = need.map((id) => byId.get(id)?.name ?? id).join(', ')
      showAlert(`🔭 정찰 결과: 항로 차단됨 — ${names || '인접 별계'} 정복 필요`)
      return
    }
    const enemyIds  = [...(node.enemy ?? []), node.miniboss, node.boss].filter(Boolean)
    const threatTxt = conqueredNodeIds.includes(node.id) ? '진압 완료' : `위협도 Lv.${node.threatLevel ?? 1}`
    const enemyTxt  = enemyIds.length ? enemyIds.map(enemyName).join(', ') : '확인된 적 전력 없음'
    const hiddenTxt = node.hidden
      ? (obtainedHiddens.includes(node.hidden) ? ' · 히든 요소 회수 완료' : ' · 미확인 신호 감지')
      : ''
    showAlert(`🔭 ${node.name} 정찰 — ${threatTxt} · 출현 전력: ${enemyTxt}${hiddenTxt}`)
  }

  // ─── 자동 이동 — 선택한 별계를 목적지로 설정, 함대가 자동 항해 ───
  function handleAutoMoveTo(node) {
    setMoveTarget(node.id)
    setFleetMode('moving')
    setSelectedId(null)
    showAlert(`🚀 ${node.name}(으)로 자동 항해를 시작합니다.`)
  }

  // ─── 정찰 — 현재 위치 중심으로 궤도 순찰 토글 ───
  function handlePatrol() {
    if (fleetMode === 'patrolling') {
      setFleetMode('manual')
      showAlert('🛑 정찰 모드 해제')
    } else {
      patrolCenterRef.current = { ...playerPos }
      patrolAngleRef.current = 0
      setFleetMode('patrolling')
      setMoveTarget(null)
      showAlert('🔄 정찰 모드 — 현 위치 궤도 순찰 시작')
    }
  }

  // ─── 정박 — 가장 가까운 정복·모항 행성으로 자동 이동 ───
  function handleDock() {
    const dockable = systems.filter(s => s.id === currentNodeId || conqueredNodeIds.includes(s.id))
    if (!dockable.length) { showAlert('정박 가능한 아군 행성이 없습니다.'); return }
    let nearest = null, nearestD = Infinity
    for (const s of dockable) {
      const p = SYS_POS[s.id]
      if (!p) continue
      const d = Math.hypot(p.x - playerPos.x, p.y - playerPos.y)
      if (d < nearestD) { nearestD = d; nearest = s }
    }
    if (!nearest) return
    setMoveTarget(nearest.id)
    setFleetMode('moving')
    setSelectedId(null)
    showAlert(`⚓ ${nearest.name}(으)로 정박 항해를 시작합니다.`)
  }

  // ─── 요약전투: 맵 위에서 즉시 결과 산출 ───
  // isConquest=true: 별계 진입 전투(노드 정복), false: 순찰대 조우(정복 없음)
  function handleSummaryBattle(nodeId, isConquest) {
    const node = systems?.find(s => s.id === nodeId)
    const eById = new Map((enemyDefs ?? []).map(e => [e.id, e]))
    const bById = new Map((bossDefs ?? []).map(b => [b.id, b]))
    const shipMap = new Map((shipsData ?? []).map(s => [s.id, s]))

    // 위협 레벨 스케일링 — base형 적에게 적용 (encounter.js와 동일 공식)
    // threat1=0.70x (초보존, 플레이어보다 약함) → threat3=1.10x → threat7=1.90x
    const threatLevel = node?.threatLevel ?? 1
    const threatScale = 0.7 + (threatLevel - 1) * 0.2

    // 해당 노드의 적 전력 수집 — base형(void_scout 등) 도 정상 해결
    const enemyStatsList = []
    for (const eid of [...(node?.enemy ?? []), node?.miniboss, node?.boss].filter(Boolean)) {
      const e = eById.get(eid)
      if (e) {
        if (e.stats) { enemyStatsList.push({ ...e.stats, name: e.name }); continue }
        if (e.base) {
          const baseShip = shipMap.get(e.base)
          if (baseShip) enemyStatsList.push({
            ...baseShip,
            hp: Math.round((baseShip.hp ?? 50) * threatScale),
            atk: Math.round((baseShip.atk ?? 10) * threatScale),
            name: e.name,
          })
          continue
        }
      }
      const b = bById.get(eid)
      if (b?.stats) enemyStatsList.push({ ...b.stats, name: b.name })
    }
    if (enemyStatsList.length === 0) enemyStatsList.push({ atk: Math.round(35 * threatScale), hp: Math.round(80 * threatScale), def: 10, name: '적 함선' })

    // 아군 전력 수집 — 레벨·성장치가 반영된 실전 스탯 사용
    const roster = useFleetStore.getState().roster
    const playerStatsList = roster
      .map(entry => {
        const base = shipMap.get(entry.shipId)
        return base ? getEffectiveShip(base, entry) : null
      })
      .filter(Boolean)

    // 전력 수치: atk × √hp
    const calcPower = (list) => list.reduce((s, sh) => s + (sh.atk ?? 10) * Math.sqrt(sh.hp ?? 50), 0)
    const playerPower = calcPower(playerStatsList)
    const enemyPower  = calcPower(enemyStatsList)

    // 전투 판정 (±30% 변동)
    const roll = 0.70 + Math.random() * 0.60
    const won  = playerPower * roll > enemyPower

    if (won) {
      const totalXp = xpRewardForVictory(enemyStatsList)
      const lines = []

      // XP 지급
      roster.forEach(entry => {
        const result = useFleetStore.getState().gainXp(entry.instanceId, totalXp)
        if (!result) return
        const name = shipMap.get(entry.shipId)?.name ?? '함선'
        lines.push(`${name} +${totalXp} XP${result.levelsGained > 0 ? ` → Lv.${result.level}!` : ''}`)
      })

      if (isConquest && node) {
        // 노드 정복
        useProgressStore.getState().conquer(nodeId)

        // 자원 보상
        if (node.reward?.resource) {
          useResourceStore.getState().earn(node.reward.resource)
          lines.push(`💰 ${Object.entries(node.reward.resource).map(([k, v]) => `${RESOURCE_NAMES[k] ?? k} +${v}`).join(' · ')}`)
        }

        // 채굴
        const mineResult = useProgressStore.getState().harvest(node)
        if (mineResult) {
          lines.push(`⛏ 채굴: ${RESOURCE_NAMES[mineResult.resource] ?? mineResult.resource} +${mineResult.amount}`)
        }

        // 히든 유니크
        if (node.hidden) {
          const ps = useProgressStore.getState()
          if (!ps.isHiddenObtained(node.id)) {
            useFleetStore.getState().addItem(node.hidden)
            ps.markHiddenObtained(node.id)
            const itMap = items ? new Map(['weapons','modules','consumables','uniques'].flatMap(c => items[c] ?? []).map(i => [i.id, i])) : new Map()
            lines.push(`🎁 히든 유니크: "${itMap.get(node.hidden)?.name ?? node.hidden}"`)
          }
        }

        setEventModal({
          title: '⚡ 요약전투 — 승리!',
          body: [`"${node.name}" 정복! 인접 항로가 열렸습니다.`, ...lines].join('\n'),
          shop: null,
        })
      } else {
        setEventModal({
          title: '⚡ 요약전투 — 승리!',
          body: ['적 순찰대를 격파했습니다.', ...lines].join('\n'),
          shop: null,
        })
      }
    } else {
      // 패배 = 게임 오버
      onGameOver?.()
    }
  }

  // ─── 맵 이벤트 요소(상인·표류 함선) 접촉 시 발동 ───
  function triggerMapEvent(ev) {
    if (ev.type === 'merchant') {
      const shop = (shopsData ?? []).find(s => s.id === 'wandering_merchant')
      setEventModal({ title: '🛒 떠돌이 상인 조우', body: '떠돌이 상인과 거래할 수 있습니다.', shop })
      return
    }
    // derelict — 표류 함선 잔해 수색
    const { resourceId, resourceName, amount } = buildResourceEvent(resources ?? [])
    useResourceStore.getState().earn({ [resourceId]: amount })
    setEventModal({ title: '🛰️ 표류 함선 발견', body: `버려진 함선의 잔해를 수색해 ${resourceName} ${amount}개를 회수했습니다.`, shop: null })
  }

  // ─── 우주 항해 중 무작위 이벤트 (전투 외 — 별계 진입과 별도) ───
  function handleRandomSpaceEvent() {
    if (!eventsData?.eventWeights || !systems) return
    // 전투 이벤트는 맵 적 함대 조우로 처리하므로 제외
    const spaceWeights = eventsData.eventWeights.filter(e => e.type !== 'battle')
    const type = pickEventType(spaceWeights)

    if (type === 'resource') {
      const { resourceId, resourceName, amount } = buildResourceEvent(resources ?? [])
      useResourceStore.getState().earn({ [resourceId]: amount })
      setEventModal({ title: '🌌 항해 중 발견', body: `우주 표류물에서 ${resourceName} ${amount}개를 회수했습니다.`, shop: null })
      return
    }
    if (type === 'peace') {
      setEventModal({ title: '😌 고요한 성간 공간', body: PEACE_MESSAGES[Math.floor(Math.random() * PEACE_MESSAGES.length)], shop: null })
      return
    }
    if (type === 'scout') {
      setEventModal({ title: '🔭 전방 정찰 완료', body: '정찰대가 인근 항로를 사전 조사했습니다.\n다음 별계 진입 시 선제 공격 기회를 잡을 수 있습니다.', shop: null })
      return
    }
    if (type === 'special') {
      const special = pickSpecialEvent(eventsData.specialEvents ?? [])
      const effects = []
      const wallet = useResourceStore.getState().wallet
      if (special.reward) {
        const re = extractResourceEffect(special.reward)
        if (re) {
          useResourceStore.getState().earn(re)
          effects.push(`획득: ${Object.entries(re).map(([k, v]) => `${RESOURCE_NAMES[k] ?? k} +${v}`).join(' · ')}`)
        }
      }
      if (special.penalty) {
        const re = extractResourceEffect(special.penalty)
        if (re) {
          const loss = Object.fromEntries(Object.entries(re).map(([k, v]) => [k, Math.min(v, wallet[k] ?? 0)]))
          useResourceStore.getState().earn(Object.fromEntries(Object.entries(loss).map(([k, v]) => [k, -v])))
          effects.push(`손실: ${Object.entries(loss).map(([k, v]) => `${RESOURCE_NAMES[k] ?? k} -${v}`).join(' · ')}`)
        }
      }
      const shop = special.shop ? (shopsData ?? []).find((s) => s.id === special.shop) ?? null : null
      setEventModal({ title: `✨ ${special.name}`, body: [special.msg, ...effects].filter(Boolean).join('\n'), shop })
    }
  }

  // ─── 이동 거리 기반 우주 이벤트 트리거 ───
  useEffect(() => {
    if (battlePending || eventModal) return
    const now = Date.now()
    const dist = Math.hypot(playerPos.x - lastEventPosRef.current.x, playerPos.y - lastEventPosRef.current.y)
    if (dist < 8 || now < eventCooldownRef.current) return
    lastEventPosRef.current = { ...playerPos }
    eventCooldownRef.current = now + 7000 // 이벤트 후 7초 쿨다운
    if (Math.random() < 0.55) handleRandomSpaceEvent()
  }, [playerPos, battlePending, eventModal]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="map-screen">
      {eventModal && (
        <EventModal
          title={eventModal.title}
          body={eventModal.body}
          shop={eventModal.shop}
          itemsById={itemsById}
          onClose={() => setEventModal(null)}
        />
      )}

      {alert && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'rgba(6,10,28,0.97)',
          border: '2px solid #dc2626',
          borderRadius: 12, padding: '14px 28px',
          color: '#fff', fontSize: 18, fontWeight: 'bold',
          zIndex: 9999, pointerEvents: 'none',
        }}>
          {alert}
        </div>
      )}

      <div className="map-canvas">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
        />
        {/* 호버 시: 가벼운 요약 툴팁 (세력/위험/보상/이동 비용) — 클릭 상세 패널과 분리 */}
        {hover && (() => {
          const node = byId.get(hover.id)
          if (!node) return null
          const pos = SYS_POS[node.id]
          const isConq  = conqueredNodeIds.includes(node.id)
          const flipX = hover.x > hover.w * 0.6
          const flipY = hover.y > hover.h * 0.65
          const threatTxt = isConq
            ? '진압 완료'
            : `보이드 군세 위협도 Lv.${node.threatLevel ?? 1}`
          return (
            <div
              className="map-tooltip holo-panel holo-panel--tight"
              style={{
                ...(flipX ? { right: hover.w - hover.x + 14 } : { left: hover.x + 14 }),
                ...(flipY ? { bottom: hover.h - hover.y + 14 } : { top: hover.y + 14 }),
              }}
            >
              <p className="map-tooltip-title">{ROLE_ICON[node.role] ?? '🪐'} {node.name}</p>
              <p className="map-tooltip-row"><span>세력</span><b>{factionOf(node, conqueredNodeIds)}</b></p>
              <p className="map-tooltip-row"><span>위험</span><b>{threatTxt}</b></p>
              <p className="map-tooltip-row"><span>보상</span><b>{briefReward(node, isConq)}</b></p>
              <p className="map-tooltip-row"><span>이동 비용</span><b>{moveApCost(playerPos, pos)} AP</b></p>
            </div>
          )
        })()}

        {/* 클릭(또는 근접) 선택 시: 하단 컨텍스트 액션바 — 선택 해제 시 사라짐 */}
        {barTarget && (() => {
          const canMove      = barStatus !== 'current'
          const isMovingHere = fleetMode === 'moving' && moveTarget === barTarget.id
          const isPatrolling = fleetMode === 'patrolling'

          return (
            <div className="map-actionbar holo-panel">
              <button className="map-actionbar-close" title="선택 해제" onClick={() => setSelectedId(null)}>✕</button>

              <div className="map-actionbar-fleet">
                <div className="map-actionbar-fleet-icon holo-badge holo-badge--circle">🛰️</div>
                <div className="map-actionbar-fleet-info">
                  <p className="map-actionbar-fleet-name">
                    {fleetSummary?.leaderName ?? '함대'}
                    {fleetSummary?.aceName && <span className="map-actionbar-fleet-ace"> · {fleetSummary.aceName}</span>}
                    <span className="map-actionbar-fleet-lv"> LV.{fleetSummary?.level ?? 1}</span>
                  </p>
                  <p className="map-actionbar-fleet-stats">
                    <span>⚔ 전력 <b>{fleetSummary?.power ?? 0}</b></span>
                    <span>🚀 이동력 <b>{fleetSummary?.mov ?? '—'}</b></span>
                    <span>⚡ TP <b>{fleetSummary?.tpLabel ?? '—'}</b></span>
                  </p>
                </div>
              </div>

              <div className="map-actionbar-target">
                <span className="map-actionbar-target-icon holo-badge holo-badge--circle">{ROLE_ICON[barTarget.role] ?? '🪐'}</span>
                <div>
                  <p className="map-actionbar-target-name">{barTarget.name}</p>
                  <p className={`map-info-status map-info-status--${barStatus}`}>{STATUS_LABEL[barStatus]}</p>
                </div>
              </div>

              <div className="map-actionbar-actions">
                <button className="act" disabled={!canMove} onClick={() => handleAutoMoveTo(barTarget)}>
                  {isMovingHere ? '항해 중...' : '이동'}
                </button>
                <button className="act" onClick={handlePatrol}>
                  {isPatrolling ? '정찰 중...' : '정찰'}
                </button>
                <button className="act" onClick={handleDock}>정박</button>
              </div>
            </div>
          )
        })()}

        {/* 자동전투 토글 — 우하단 작게 유지 */}
        <div style={{ position: 'absolute', bottom: 14, right: 14 }}>
          <button
            className={`turn-hub-btn holo-panel holo-panel--tight${summaryBattle ? ' turn-hub-btn--on' : ''}`}
            onClick={() => useSettingsStore.getState().setSummaryBattle(!summaryBattle)}
            title="자동전투 — 켜면 전투 진입 시 전술전투 대신 결과를 즉시 산출합니다"
          >
            <span>⚡ 자동전투 {summaryBattle ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {selected && (() => {
        const status   = statusOf(selected, { currentNodeId, conqueredNodeIds })
        const enemyIds = [...(selected.enemy ?? []), selected.miniboss, selected.boss].filter(Boolean)
        const isConq   = conqueredNodeIds.includes(selected.id)

        // ── 클릭 상세 패널: 함대 배치 현황 ──
        let fleetStatusText
        if (isConq) {
          fleetStatusText = '정복 완료 — 적 함대 소탕됨'
        } else if (selected.role === 'home') {
          const homeGuardCount = mapEnemies.filter(e => e.homeGuard).length
          fleetStatusText = homeGuardCount > 0 ? `튜토리얼 호위 함대 ${homeGuardCount}척 배회 중` : '평온 — 위협 없음'
        } else {
          const guards      = mapEnemies.filter(e => e.nodeRef === selected.id && !e.homeGuard)
          const eliteCount  = guards.filter(e => e.tier === 'elite').length
          const regularCount = guards.length - eliteCount
          const bossHere = mapBosses.some(b => b.nodeRef === selected.id)
          const parts = []
          if (bossHere) parts.push('수호 보스 건재')
          if (eliteCount > 0) parts.push(`준보스급 ${eliteCount}척`)
          if (regularCount > 0) parts.push(`호위 ${regularCount}척`)
          fleetStatusText = parts.length ? parts.join(' · ') : '배치 정보 없음'
        }

        // ── 클릭 상세 패널: 개발 단계 요약 ──
        let devStatusText
        if (!selected.dev) {
          devStatusText = '시설 없음'
        } else if (!isConq) {
          devStatusText = `미정복 — 정복 후 "${selected.dev.name}" 건설 가능`
        } else if (isDeveloped(selected.id)) {
          devStatusText = `완료 — ${selected.dev.name}`
        } else {
          devStatusText = `건설 가능 — ${selected.dev.name}`
        }

        // ── 클릭 상세 패널: 히든 요소 유무 (정체는 비공개) ──
        let hiddenStatusText
        if (!selected.hidden) {
          hiddenStatusText = '없음'
        } else if (obtainedHiddens.includes(selected.hidden)) {
          hiddenStatusText = '발견 완료 ✅'
        } else {
          hiddenStatusText = '미발견 — 정복 시 확인 가능'
        }

        return (
          <aside className="map-info">
            <h3 className="map-info-name">
              {ROLE_ICON[selected.role] ?? '🪐'} {selected.name}
              <span className="map-info-theme"> · {selected.theme}</span>
            </h3>
            <p className="map-info-meta">
              {selected.role === 'home' ? '모항' : selected.role === 'boss' ? '성단 보스' : '미션 별계'}
              {selected.terrain && selected.terrain !== 'none' ? ` · 지형: ${selected.terrain}` : ''}
              {' · '}
              <span className={`map-info-status map-info-status--${status}`}>{STATUS_LABEL[status]}</span>
            </p>

            <div className="map-info-card">
              <p className="map-info-card-h holo-h">상세 정보</p>
              <p className="map-info-card-row">🛰 함대 배치 <span>{fleetStatusText}</span></p>
              <p className="map-info-card-row">🏗 개발 단계 <span>{devStatusText}</span></p>
              <p className="map-info-card-row">🎁 히든 요소 <span>{hiddenStatusText}</span></p>
            </div>

            {enemyIds.length > 0 && (
              <p className="map-info-enemies">⚔️ 출현 전력: {enemyIds.map(enemyName).join(', ')}</p>
            )}
            {selected.reward && (
              <p className="map-info-reward">
                🎁 클리어 보상:{' '}
                {selected.reward.ace && `에이스 "${selected.reward.ace}" 합류`}
                {selected.reward.aceCondition && `에이스 조건 달성`}
                {selected.reward.resource && `자원 ${Object.entries(selected.reward.resource).map(([k,v])=>`${k} +${v}`).join(', ')}`}
                {selected.reward.unlockShip && ` · 함선 "${selected.reward.unlockShip}" 해금`}
                {selected.reward.ending && '엔딩 — 다음 은하 티저'}
              </p>
            )}

            {getMiningInfo(selected) && (
              <p className="map-info-mining" style={{ whiteSpace: 'pre-line' }}>
                {getMiningInfo(selected)}
              </p>
            )}

            {selected.dev && (() => {
              const devDone = isDeveloped(selected.id)
              const canDev  = canDevelop(selected, isConq)
              if (!isConq) return null
              if (devDone) return <p className="map-dev-done">🏗 {selected.dev.name} 완료 — {selected.dev.desc}</p>
              return (
                <div className="map-dev-panel">
                  <p className="map-dev-title">🏗 개발 가능: {selected.dev.name}</p>
                  <p className="map-dev-desc">{selected.dev.desc}</p>
                  <p className="map-dev-cost">
                    비용: <span className={canDev ? '' : 'map-dev-cost--short'}>{formatCost(selected.dev.cost)}</span>
                  </p>
                  <button
                    className={`map-action-btn map-action-btn--develop${canDev ? '' : ' map-action-btn--disabled'}`}
                    disabled={!canDev}
                    onClick={() => handleDevelop(selected)}
                  >
                    {canDev ? '🏗 개발 실행' : '⚠ 자원 부족'}
                  </button>
                </div>
              )
            })()}

            {selected.secretShop && isConq && (() => {
              const shop = (shopsData ?? []).find((s) => s.id === selected.secretShop)
              if (!shop) return null
              return (
                <button
                  className="map-action-btn map-action-btn--enter"
                  onClick={() => setEventModal({ title: `🛒 ${shop.name}`, body: shop.note ?? '', shop })}
                >
                  🛒 유령 시장 열기
                </button>
              )
            })()}

            {harvestMsg && <p className="map-info-harvest">{harvestMsg}</p>}

            {/* 입항 — 함대의 "실제 좌표"가 이 별계 반경(SYSTEM_DIST) 안이고 모항/정복지일 때만 (스펙 §2 도킹 게이트).
                currentNodeId는 마지막 방문 기록이라 떠나도 남으므로 도킹 판정에 쓰지 않는다. */}
            {(() => {
              if (!onEnterPlace || !(selected.role === 'home' || isConq)) return null
              const selPos = SYS_POS[selected.id]
              const fleetDist = selPos ? Math.hypot(selPos.x - playerPos.x, selPos.y - playerPos.y) : Infinity
              if (fleetDist < SYSTEM_DIST) {
                return (
                  <button
                    className="map-action-btn map-action-btn--planet"
                    onClick={() => onEnterPlace(selected.id)}
                  >
                    🛬 입항 — {selected.role === 'home' ? '정거장 내부' : '행성 관리'}
                  </button>
                )
              }
              return (
                <p className="map-info-hint">
                  🛬 입항하려면 함대를 이 별계 궤도까지 이동시키세요.
                </p>
              )
            })()}
            {status === 'current'   && <p className="map-info-hint">현재 함대가 머무르고 있는 노드입니다.</p>}
            {status === 'locked'    && <p className="map-info-hint">🔒 연결된 인접 별계를 정복해야 이 항로가 열립니다.</p>}
            {status === 'conquered' && (
              <button className="map-action-btn" onClick={() => handleMoveTo(selected)}>
                ➡ 이 노드로 이동{canHarvest(selected) ? ' (채굴)' : ''}
              </button>
            )}
            {status === 'reachable' && selected.role === 'home' && (
              <button className="map-action-btn" onClick={() => handleMoveTo(selected)}>
                ➡ 모항으로 귀환
              </button>
            )}
            {status === 'reachable' && selected.role !== 'home' && (
              <button className="map-action-btn map-action-btn--enter" onClick={() => handleEnterNode(selected)}>
                🚀 별계 진입 — 이벤트 판정
              </button>
            )}
          </aside>
        )
      })()}
    </div>
  )
}
