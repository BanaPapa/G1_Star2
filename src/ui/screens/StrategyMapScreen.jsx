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

const PEACE_MESSAGES = [
  '함대가 잠시 휴식을 취했습니다. 승무원들의 사기가 올랐습니다.',
  '성간 공간의 고요함 속에서 잠시 숨을 고릅니다.',
  '특별한 위협 없이 항법 시뮬레이션을 진행했습니다.',
  '일상적인 항해입니다. 정비반이 엔진 점검을 마쳤습니다.',
]

const SYS_POS = {
  s0: { x: 7,  y: 50 },
  s1: { x: 22, y: 20 },
  s2: { x: 30, y: 75 },
  s3: { x: 48, y: 48 },
  s4: { x: 62, y: 14 },
  s5: { x: 63, y: 83 },
  s6: { x: 76, y: 48 },
  s7: { x: 87, y: 22 },
  s8: { x: 93, y: 72 },
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

function genStars(n = 240) {
  return Array.from({ length: n }, () => ({
    x: Math.random(), y: Math.random(),
    r: Math.random() * 1.4 + 0.2,
    a: Math.random() * 0.55 + 0.12,
  }))
}

// 각 노드 근처에 균형 있게 적 배치 — 위협 레벨이 높을수록 +1기 더 배치
function spawnNearNode(ref, idBase) {
  const refPos = SYS_POS[ref.id]
  if (!refPos) return null
  for (let tries = 0; tries < 40; tries++) {
    const angle = Math.random() * Math.PI * 2
    const dist = 9 + Math.random() * 16
    const x = Math.max(3, Math.min(97, refPos.x + Math.cos(angle) * dist))
    const y = Math.max(3, Math.min(97, refPos.y + Math.sin(angle) * dist))
    let tooClose = false
    for (const pos of Object.values(SYS_POS)) {
      if (Math.hypot(x - pos.x, y - pos.y) < 9) { tooClose = true; break }
    }
    if (tooClose) continue
    return { id: String(idBase), x, y, homeX: x, homeY: y, nodeRef: ref.id, threatLevel: ref.threatLevel ?? 1, chasing: false, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2 }
  }
  return null
}

function genEnemies(systems) {
  if (!systems) return []
  const missionNodes = systems.filter(s => s.role !== 'home')
  const result = []
  let idCounter = 0
  for (const ref of missionNodes) {
    // 각 노드에 최소 1기, tier 4부터 +1기, tier 6부터 +1기 추가
    const count = 1 + (ref.threatLevel >= 4 ? 1 : 0) + (ref.threatLevel >= 6 ? 1 : 0)
    for (let i = 0; i < count; i++) {
      const enemy = spawnNearNode(ref, `e${idCounter++}`)
      if (enemy) result.push(enemy)
    }
  }
  return result
}

export default function StrategyMapScreen({ onEnterBattle, onGameOver }) {
  // ─── 스토어 ───
  const systems          = useDataStore((s) => s.data?.systems?.systems)
  const enemyDefs        = useDataStore((s) => s.data?.enemies?.enemies)
  const bossDefs         = useDataStore((s) => s.data?.enemies?.bosses)
  const shipsData        = useDataStore((s) => s.data?.ships?.ships)
  const eventsData       = useDataStore((s) => s.data?.events)
  const shopsData        = useDataStore((s) => s.data?.shops?.shops)
  const resources        = useDataStore((s) => s.data?.resources?.resources)
  const items            = useDataStore((s) => s.data?.items)
  const currentNodeId    = useProgressStore((s) => s.currentNodeId)
  const conqueredNodeIds = useProgressStore((s) => s.conqueredNodeIds)
  const moveTo           = useProgressStore((s) => s.moveTo)
  const canHarvest       = useProgressStore((s) => s.canHarvest)
  const harvest          = useProgressStore((s) => s.harvest)
  const harvestDev       = useProgressStore((s) => s.harvestDev)
  const miningDeposits   = useProgressStore((s) => s.miningDeposits)
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
  // drawFnRef: 매 렌더마다 최신 drawFrame을 가리킴 → RAF 루프가 재시작 없이 최신 상태 그림
  const drawFnRef  = useRef(null)
  // playerPosRef: 적 어그로 인터벌에서 재시작 없이 현재 위치를 읽기 위한 ref
  const playerPosRef = useRef({ ...SYS_POS.s0 })
  // eventModalRef: 모달 열림 여부를 인터벌 콜백에서 참조 (deps 없이)
  const eventModalRef = useRef(null)

  // ─── 우주 이동 이벤트 추적 ───
  const lastEventPosRef  = useRef({ ...SYS_POS.s0 })
  const eventCooldownRef = useRef(0)

  // ─── 게임 상태 ───
  const [playerPos,     setPlayerPos]     = useState({ ...SYS_POS.s0 })
  const [mapEnemies,    setMapEnemies]    = useState([])
  const [selectedId,    setSelectedId]    = useState(null)
  const [harvestMsg,    setHarvestMsg]    = useState(null)
  const [eventModal,    setEventModal]    = useState(null)
  const [alert,         setAlert]         = useState(null)
  const [battlePending, setBattlePending] = useState(null)

  // playerPos/eventModal → ref 동기화 (인터벌 콜백이 deps 없이 최신 상태 참조)
  useEffect(() => { playerPosRef.current = playerPos }, [playerPos])
  useEffect(() => { eventModalRef.current = eventModal }, [eventModal])

  // 적 초기화 (systems 로드 후 1회)
  useEffect(() => {
    if (systems && mapEnemies.length === 0) {
      setMapEnemies(genEnemies(systems))
    }
  }, [systems]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 적 이동 (0.4초마다) — 어그로 범위 내 플레이어 추격, 이탈 시 귀환, 그 외 순찰 ───
  useEffect(() => {
    if (!systems) return
    const AGGRO_DIST = 14   // 이 거리 이내로 플레이어가 오면 추격 시작
    const LEASH_DIST = 26   // 홈에서 이 거리 이상 멀어지면 추격 포기 · 귀환
    const id = setInterval(() => {
      // 모달(전투 결과/이벤트)이 열려 있는 동안은 적 이동 전부 정지 — 모달 닫기 전 조우 방지
      if (eventModalRef.current) return
      const pp = playerPosRef.current
      setMapEnemies(prev => prev.map(e => {
        const homeX = e.homeX ?? e.x
        const homeY = e.homeY ?? e.y
        const dPlayer = Math.hypot(e.x - pp.x, e.y - pp.y)
        const dHome   = Math.hypot(e.x - homeX, e.y - homeY)

        let chasing = e.chasing ?? false
        if (!chasing && dPlayer < AGGRO_DIST) chasing = true
        if (chasing && dHome > LEASH_DIST)    chasing = false

        if (chasing) {
          // 플레이어 방향으로 빠르게 이동
          const dx = pp.x - e.x, dy = pp.y - e.y
          const len = Math.hypot(dx, dy) || 1
          const spd = 4.2
          return { ...e, x: Math.max(2, Math.min(98, e.x + dx/len*spd)), y: Math.max(2, Math.min(98, e.y + dy/len*spd)), vx: dx/len*spd, vy: dy/len*spd, chasing, homeX, homeY }
        }

        if (dHome > 5) {
          // 홈 포인트로 귀환
          const dx = homeX - e.x, dy = homeY - e.y
          const len = Math.hypot(dx, dy) || 1
          const spd = 2.5
          return { ...e, x: Math.max(2, Math.min(98, e.x + dx/len*spd)), y: Math.max(2, Math.min(98, e.y + dy/len*spd)), vx: dx/len*spd, vy: dy/len*spd, chasing: false, homeX, homeY }
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
          return { ...e, x: Math.max(2, Math.min(98, e.x + dx/len*1.8)), y: Math.max(2, Math.min(98, e.y + dy/len*1.8)), vx: dx/len*2, vy: dy/len*2, chasing: false, homeX, homeY }
        }
        for (const pos of Object.values(SYS_POS)) {
          if (Math.hypot(nx - pos.x, ny - pos.y) < 8) {
            return { ...e, x: e.x - vx*0.5, y: e.y - vy*0.5, vx: -vx*0.9, vy: -vy*0.9, chasing: false, homeX, homeY }
          }
        }
        return { ...e, x: nx, y: ny, vx, vy, chasing: false, homeX, homeY }
      }))
    }, 400)
    return () => clearInterval(id)
  }, [systems]) // playerPos는 playerPosRef로 참조하므로 deps 불필요

  // ─── 적 리스폰 (10초마다 최대 14기까지 보충) ───
  useEffect(() => {
    if (!systems) return
    const missionNodes = systems.filter(s => s.role !== 'home')
    const interval = setInterval(() => {
      setMapEnemies(prev => {
        if (prev.length >= 14) return prev
        const ref = pickNodeWeighted(missionNodes)
        if (!ref) return prev
        const refPos = SYS_POS[ref.id]
        if (!refPos) return prev
        const angle = Math.random() * Math.PI * 2
        const dist = 8 + Math.random() * 14
        const x = Math.max(3, Math.min(97, refPos.x + Math.cos(angle) * dist))
        const y = Math.max(3, Math.min(97, refPos.y + Math.sin(angle) * dist))
        for (const pos of Object.values(SYS_POS)) {
          if (Math.hypot(x - pos.x, y - pos.y) < 9) return prev
        }
        return [...prev, {
          id: `e${Date.now()}`,
          x, y, homeX: x, homeY: y,
          nodeRef: ref.id,
          threatLevel: ref.threatLevel ?? 1,
          chasing: false,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
        }]
      })
    }, 10000)
    return () => clearInterval(interval)
  }, [systems]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 전투 딜레이 처리 ───
  useEffect(() => {
    if (!battlePending) return
    const t = setTimeout(() => {
      onEnterBattle(battlePending)
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

    // 적 함대 — ENCOUNTER_DIST 이내 직접 접촉 시 전투
    const hit = mapEnemies.find(e =>
      Math.hypot(e.x - playerPos.x, e.y - playerPos.y) < ENCOUNTER_DIST
    )
    if (hit) {
      setMapEnemies(prev => prev.filter(e => e.id !== hit.id))
      if (summaryBattle) {
        handleSummaryBattle(hit.nodeRef, false)
      } else {
        showAlert('⚔️ 적 함대 발견! 전투 개시!')
        setBattlePending(hit.nodeRef)
      }
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
  }, [playerPos, mapEnemies, systems, battlePending, eventModal]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 키보드 이동 ───
  useEffect(() => {
    const STEP = 1.5
    function onKey(e) {
      let dx = 0, dy = 0
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': dy = -STEP; break
        case 'ArrowDown':  case 's': case 'S': dy =  STEP; break
        case 'ArrowLeft':  case 'a': case 'A': dx = -STEP; break
        case 'ArrowRight': case 'd': case 'D': dx =  STEP; break
        default: return
      }
      e.preventDefault()
      setPlayerPos(p => ({
        x: Math.max(0, Math.min(100, p.x + dx)),
        y: Math.max(0, Math.min(100, p.y + dy)),
      }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ─── 마우스 클릭 → 이동 ───
  function handleCanvasClick(e) {
    if (battlePending) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    setPlayerPos({
      x: Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width  * 100)),
      y: Math.max(0, Math.min(100, (e.clientY - rect.top)  / rect.height * 100)),
    })
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

    // 배경 별
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

    // 별계
    systems?.forEach(sys => {
      const pos = SYS_POS[sys.id]
      if (!pos) return
      const px = pos.x / 100 * W
      const py = pos.y / 100 * H
      const isCurr = sys.id === currentNodeId
      const isConq = conqueredNodeIds.includes(sys.id)
      const isSel  = sys.id === selectedId

      const glowR = isCurr ? 80 + Math.sin(t) * 10 : 60
      const g = ctx.createRadialGradient(px, py, 0, px, py, glowR)
      if (sys.role === 'boss') {
        g.addColorStop(0, 'rgba(220,38,38,0.5)')
        g.addColorStop(1, 'rgba(220,38,38,0)')
      } else if (isCurr) {
        g.addColorStop(0, 'rgba(79,184,255,0.6)')
        g.addColorStop(1, 'rgba(79,184,255,0)')
      } else if (isConq) {
        g.addColorStop(0, 'rgba(255,209,102,0.42)')
        g.addColorStop(1, 'rgba(255,209,102,0)')
      } else {
        g.addColorStop(0, 'rgba(180,180,255,0.18)')
        g.addColorStop(1, 'rgba(180,180,255,0)')
      }
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(px, py, glowR, 0, Math.PI * 2)
      ctx.fill()

      if (isSel) {
        ctx.strokeStyle = 'rgba(255,209,102,0.85)'
        ctx.lineWidth = 2.5
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.arc(px, py, 48, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.font = '52px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(ROLE_ICON[sys.role] ?? '🪐', px, py)

      ctx.font = 'bold 14px sans-serif'
      ctx.fillStyle = isCurr ? '#4fb8ff' : isConq ? '#ffd166' : '#aaa'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(sys.name, px, py + 34)
    })

    // 적 함대 — 위협 레벨별 크기·색상·이모지 + 어그로 시 빨간 링 표시
    mapEnemies.forEach(enemy => {
      const tier = enemy.threatLevel ?? 1
      const isChasing = enemy.chasing ?? false
      const ex = enemy.x / 100 * W
      const ey = enemy.y / 100 * H
      const pulse = (isChasing ? 18 : 12) + tier * 1.5 + Math.sin(t * (isChasing ? 3 : 1.5) + enemy.x * 0.3) * 3
      const rAlpha = isChasing ? 0.9 : Math.min(0.85, 0.38 + tier * 0.07)

      const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, pulse)
      eg.addColorStop(0, `rgba(220,38,38,${rAlpha})`)
      eg.addColorStop(1, 'rgba(220,38,38,0)')
      ctx.fillStyle = eg
      ctx.beginPath()
      ctx.arc(ex, ey, pulse, 0, Math.PI * 2)
      ctx.fill()

      // 어그로 링
      if (isChasing) {
        ctx.strokeStyle = `rgba(255,80,80,${0.7 + Math.sin(t*4)*0.3})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(ex, ey, pulse + 4, 0, Math.PI * 2)
        ctx.stroke()
      }

      const emoji = tier >= 6 ? '💀' : tier >= 4 ? '🛸' : '👾'
      ctx.font = `${16 + tier * 1.5}px Arial`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(emoji, ex, ey)
    })

    // 플레이어 우주선
    const ppx = playerPos.x / 100 * W
    const ppy = playerPos.y / 100 * H
    const pg = ctx.createRadialGradient(ppx, ppy, 0, ppx, ppy, 44 + Math.sin(t) * 5)
    pg.addColorStop(0, 'rgba(251,191,36,0.75)')
    pg.addColorStop(1, 'rgba(251,191,36,0)')
    ctx.fillStyle = pg
    ctx.beginPath()
    ctx.arc(ppx, ppy, 44, 0, Math.PI * 2)
    ctx.fill()

    ctx.font = '36px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🚀', ppx, ppy)

    // 조작 안내
    ctx.font = '11px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('방향키/WASD · 마우스 클릭으로 이동 · 👾 적에 직접 닿으면 전투', 8, H - 6)
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
    if (!eventsData?.eventWeights) {
      if (summaryBattle) { handleSummaryBattle(node.id, true); return }
      onEnterBattle(node.id); return
    }
    const type = pickEventType(eventsData.eventWeights)
    if (type === 'battle') {
      if (summaryBattle) { handleSummaryBattle(node.id, true); return }
      onEnterBattle(node.id); return
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

  // ─── 요약전투: 맵 위에서 즉시 결과 산출 ───
  // isConquest=true: 별계 진입 전투(노드 정복), false: 순찰대 조우(정복 없음)
  function handleSummaryBattle(nodeId, isConquest) {
    const node = systems?.find(s => s.id === nodeId)
    const eById = new Map((enemyDefs ?? []).map(e => [e.id, e]))
    const bById = new Map((bossDefs ?? []).map(b => [b.id, b]))
    const shipMap = new Map((shipsData ?? []).map(s => [s.id, s]))

    // 위협 레벨 스케일링 — base형 적에게 적용 (encounter.js와 동일 공식)
    const threatLevel = node?.threatLevel ?? 1
    const threatScale = threatLevel > 1 ? 1 + (threatLevel - 1) * 0.3 : 1

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
        />
        <button
          className={`map-summary-toggle${summaryBattle ? ' map-summary-toggle--on' : ''}`}
          onClick={() => useSettingsStore.getState().setSummaryBattle(!summaryBattle)}
        >
          ⚡ 요약전투: {summaryBattle ? 'ON — 즉시 결과 산출' : 'OFF — 전술전투 진입'}
        </button>
      </div>

      {selected && (() => {
        const status   = statusOf(selected, { currentNodeId, conqueredNodeIds })
        const enemyIds = [...(selected.enemy ?? []), selected.miniboss, selected.boss].filter(Boolean)
        const isConq   = conqueredNodeIds.includes(selected.id)
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
