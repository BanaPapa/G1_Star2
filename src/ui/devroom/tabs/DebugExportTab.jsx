// Debug / Export 탭 — JSON 내보내기/불러오기/초기화/검증 + 테스트 지급 + 현재 config 원본 보기.
import { useRef, useState } from 'react'
import { useGameConfigStore } from '../../../state/useGameConfigStore'
import { useBattleStore } from '../../../state/useBattleStore'
import { useFleetStore } from '../../../state/useFleetStore'
import { useResourceStore } from '../../../state/useResourceStore'
import { useDataStore } from '../../../state/useDataStore'
import { Section } from '../controls'

const RESULT_LABELS = { victory: '🏆 승리', defeat: '💥 패배', flee: '🚀 도주' }

export default function DebugExportTab() {
  const config = useGameConfigStore((s) => s.config)
  const exportJson = useGameConfigStore((s) => s.exportJson)
  const importJson = useGameConfigStore((s) => s.importJson)
  const resetAll = useGameConfigStore((s) => s.resetAll)
  const battleLog = useBattleStore((s) => s.battleLog)
  const clearBattleLog = useBattleStore((s) => s.clearBattleLog)
  const fileRef = useRef(null)
  const [msg, setMsg] = useState(null)

  function onPickFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result))
        const res = importJson(obj)
        setMsg(res.ok ? { ok: true, text: '불러오기 완료 — 상단 Save로 영구 저장하세요.' } : { ok: false, text: res.error })
      } catch (err) {
        setMsg({ ok: false, text: `JSON 파싱 오류: ${err.message}` })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // 테스트 지급 — 연구/상점 없이 무기 메커니즘(Phase 4)을 직접 체험하기 위한 개발용 지름길.
  // 지급 + 현재 함대에 데모 로드아웃 자동 장착까지 한 번에 (모의 전투에 바로 반영).
  // 데모 로드아웃은 5계열 대표 무기를 함선 순서대로 배정한다 (레이저 관통/이온 교란/플라즈마 폭발/중력 밀치기/반물질 블랙홀…).
  const DEMO_LOADOUT = ['wpn_laser_pierce', 'wpn_ap_disruptor', 'wpn_plasma_burst', 'wpn_graviton_ram', 'wpn_micro_singularity', 'wpn_gravity_collapse', 'wpn_total_annihilation']

  function grantAllWeapons() {
    const items = useDataStore.getState().data?.items
    const weapons = items?.weapons ?? []
    const fleet = useFleetStore.getState()
    for (const w of weapons) fleet.addItem(w.id, 1)
    // 미장착 함선에만 데모 무기 배정 (직접 장착한 무기는 존중)
    const equipped = []
    fleet.roster.forEach((entry, i) => {
      if (entry.equipment.weapon) return
      const weaponId = DEMO_LOADOUT[i % DEMO_LOADOUT.length]
      fleet.equip(entry.instanceId, 'weapon', weaponId)
      const item = weapons.find((w) => w.id === weaponId)
      equipped.push(item?.name ?? weaponId)
    })
    setMsg({
      ok: true,
      text: `무기 ${weapons.length}종 지급 완료` +
        (equipped.length ? ` + 데모 장착: ${equipped.join(', ')}` : ' (전 함선 이미 장착됨 — 변경은 함대 편성에서)') +
        ' — 에디터 탭 🧪 테스트로 모의 전투를 여세요.',
    })
  }

  function grantResources() {
    useResourceStore.getState().earn({ sc: 10000, ti: 5000, ec: 5000, dm: 2000, nc: 2000, qd: 1000 })
    setMsg({ ok: true, text: '자원 지급 완료 (SC 10,000 외).' })
  }

  // 계열 스킨 QA — 함대 전체를 지정 스킨으로 순환(기본 → laser → 기본). 제작된 스킨이 늘면 목록에 추가.
  const SKIN_CYCLE = [null, 'laser']
  function cycleFleetSkin() {
    const fleet = useFleetStore.getState()
    const current = fleet.roster[0]?.skin ?? null
    const next = SKIN_CYCLE[(SKIN_CYCLE.indexOf(current) + 1) % SKIN_CYCLE.length]
    fleet.debugSetFleetSkin(next)
    setMsg({ ok: true, text: `함대 스킨 → ${next ?? '기본'} — 에디터 탭 🧪 테스트로 모의 전투에서 확인하세요.` })
  }

  function validate() {
    const issues = []
    const acc = config?.combat?.accuracy ?? {}
    if (acc.minHitChance > acc.maxHitChance) issues.push('명중률 최소값이 최대값보다 큽니다.')
    if ((config?.combat?.defense?.maxDamageReduction ?? 0) > 100) issues.push('방어 최대 감소율이 100%를 초과합니다.')
    const ids = (config?.priorityRules ?? []).map((r) => r.id)
    if (new Set(ids).size !== ids.length) issues.push('priorityRules에 중복 id가 있습니다.')
    setMsg(issues.length ? { ok: false, text: issues.join(' / ') } : { ok: true, text: '검증 통과 — 문제 없음.' })
  }

  return (
    <div className="scr-tabbody">
      <Section title="Export / Import / 검증">
        <div className="scr-btn-row">
          <button className="scr-btn" onClick={() => exportJson()}>⬇ Export JSON</button>
          <button className="scr-btn" onClick={() => fileRef.current?.click()}>⬆ Import JSON</button>
          <button className="scr-btn" onClick={validate}>✓ 검증</button>
          <button
            className="scr-btn scr-btn--danger"
            onClick={() => { if (window.confirm('모든 설정을 기본값으로 초기화할까요?')) { resetAll(); setMsg({ ok: true, text: '기본값으로 초기화됨.' }) } }}
          >↺ 전체 초기화</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onPickFile} />
        </div>
        {msg && <p className={`scr-msg${msg.ok ? ' scr-msg--ok' : ' scr-msg--err'}`}>{msg.text}</p>}
      </Section>

      <Section title="테스트 지급 (개발용)" desc="연구/상점 없이 무기 계열 메커니즘을 바로 체험 — 지급+데모 장착 후 에디터 탭 [🧪 테스트]로 모의 전투. 무기 교체는 [함대 편성]에서">
        <div className="scr-btn-row">
          <button className="scr-btn" onClick={grantAllWeapons}>🗡 무기 25종 지급 + 데모 장착</button>
          <button className="scr-btn" onClick={grantResources}>💰 자원 지급 (+SC 10,000 외)</button>
          <button className="scr-btn" onClick={cycleFleetSkin}>🎨 함대 스킨 순환 (기본↔laser)</button>
        </div>
      </Section>

      <Section title="현재 config (읽기 전용)" desc="localStorage 키: 7star_dev_config">
        <pre className="scr-json scr-json--ro scr-json--tall">{JSON.stringify(config, null, 2)}</pre>
      </Section>

      <Section title={`전투 기록 (${battleLog.length}건)`}>
        {battleLog.length === 0 ? (
          <p style={{ color: '#666', fontSize: 13 }}>전투 기록이 없습니다.</p>
        ) : (
          <>
            <button className="scr-btn scr-btn--danger" style={{ marginBottom: 8 }} onClick={clearBattleLog}>
              ↺ 기록 초기화
            </button>
            <div style={{ maxHeight: 260, overflowY: 'auto', fontSize: 12, lineHeight: 1.7 }}>
              {battleLog.map((rec) => (
                <div key={rec.id} style={{ borderBottom: '1px solid #1e2a3a', paddingBottom: 4, marginBottom: 4 }}>
                  <span style={{ color: rec.result === 'victory' ? '#ffd166' : rec.result === 'flee' ? '#3ad6c4' : '#dc2626', fontWeight: 'bold' }}>
                    {RESULT_LABELS[rec.result] ?? rec.result}
                  </span>
                  {' · '}
                  <span style={{ color: '#cdd8f4' }}>{rec.nodeName}</span>
                  {rec.xpGained > 0 && <span style={{ color: '#7dffb0' }}> · XP +{rec.xpGained}</span>}
                  {rec.captured > 0 && <span style={{ color: '#3ad6c4' }}> · 포획 {rec.captured}척</span>}
                  <span style={{ color: '#566' }}> · {new Date(rec.date).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>
    </div>
  )
}
