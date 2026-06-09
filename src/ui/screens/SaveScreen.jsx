import { useSaveStore, getSlotMeta } from '../../state/useSaveStore'
import { useSettingsStore } from '../../state/useSettingsStore'
import './SaveScreen.css'

const SLOT_LABELS = ['슬롯 1', '슬롯 2', '슬롯 3']

const RESOURCE_LABEL = { sc: 'SC', ti: 'Ti', ec: 'EC', dm: 'DM' }

function formatTimestamp(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function SlotCard({ slot, rev, onLoaded }) {
  const save = useSaveStore((s) => s.save)
  const load = useSaveStore((s) => s.load)
  const del  = useSaveStore((s) => s.delete)

  // rev가 바뀌면 재렌더 — 슬롯 데이터를 직접 읽는다
  void rev
  const meta = getSlotMeta(slot)

  return (
    <div className={`save-slot${meta ? ' save-slot--used' : ''}`}>
      <div className="save-slot-header">
        <span className="save-slot-label">{SLOT_LABELS[slot - 1]}</span>
        {meta && <span className="save-slot-time">{formatTimestamp(meta.timestamp)}</span>}
      </div>

      {meta ? (
        <div className="save-slot-info">
          <span>정복 노드 {meta.conqueredCount}개</span>
          <span>
            {Object.entries(meta.wallet)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${RESOURCE_LABEL[k] ?? k} ${v}`)
              .join(' · ')}
          </span>
        </div>
      ) : (
        <p className="save-slot-empty">— 빈 슬롯 —</p>
      )}

      <div className="save-slot-actions">
        <button className="save-btn save-btn--save" onClick={() => save(slot)}>
          💾 저장
        </button>
        {meta && (
          <>
            <button className="save-btn save-btn--load" onClick={() => { load(slot); onLoaded?.() }}>
              📂 불러오기
            </button>
            <button className="save-btn save-btn--delete" onClick={() => del(slot)}>
              🗑 삭제
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function SettingsPanel() {
  const cutinEnabled = useSettingsStore((s) => s.cutinEnabled)
  const soundVolume  = useSettingsStore((s) => s.soundVolume)
  const battleSpeed  = useSettingsStore((s) => s.battleSpeed)
  const setCutin     = useSettingsStore((s) => s.setCutinEnabled)
  const setVolume    = useSettingsStore((s) => s.setSoundVolume)
  const setSpeed     = useSettingsStore((s) => s.setBattleSpeed)

  return (
    <div className="settings-panel">
      <h3 className="settings-title">⚙️ 설정</h3>

      <div className="settings-row">
        <span className="settings-label">필살기 컷인 연출</span>
        <div className="settings-toggle-group">
          <button
            className={`settings-toggle-btn${cutinEnabled ? ' active' : ''}`}
            onClick={() => setCutin(true)}
          >ON</button>
          <button
            className={`settings-toggle-btn${!cutinEnabled ? ' active' : ''}`}
            onClick={() => setCutin(false)}
          >OFF</button>
        </div>
      </div>

      <div className="settings-row">
        <span className="settings-label">전투 속도</span>
        <div className="settings-toggle-group">
          <button
            className={`settings-toggle-btn${battleSpeed === 'normal' ? ' active' : ''}`}
            onClick={() => setSpeed('normal')}
          >보통</button>
          <button
            className={`settings-toggle-btn${battleSpeed === 'fast' ? ' active' : ''}`}
            onClick={() => setSpeed('fast')}
          >빠름</button>
        </div>
      </div>

      <div className="settings-row">
        <span className="settings-label">사운드 볼륨 {soundVolume}%</span>
        <input
          className="settings-slider"
          type="range"
          min={0}
          max={100}
          value={soundVolume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </div>
  )
}

// MOD-12/13: 저장/불러오기 3슬롯 + 설정 패널
export default function SaveScreen({ onBack, onLoaded }) {
  const rev = useSaveStore((s) => s.rev) // 슬롯 변경 시 재렌더 트리거

  return (
    <div className="save-screen">
      {onBack && (
        <button className="save-back-btn" onClick={onBack}>← 타이틀로</button>
      )}
      <section className="save-section">
        <h3 className="save-section-title">💾 저장 / 불러오기</h3>
        <div className="save-slots">
          {[1, 2, 3].map((slot) => (
            <SlotCard key={slot} slot={slot} rev={rev} onLoaded={onLoaded} />
          ))}
        </div>
      </section>

      <SettingsPanel />
    </div>
  )
}
