import { useState } from 'react'
import { useDataStore } from '../../state/useDataStore'
import { useFleetStore } from '../../state/useFleetStore'
import { useResearchStore } from '../../state/useResearchStore'
import { useProgressStore } from '../../state/useProgressStore'
import { useDevelopmentStore } from '../../state/useDevelopmentStore'
import { useResourceStore } from '../../state/useResourceStore'
import { getEffectiveShip, applyEquipment, getUnitFinishers, canPromote, xpToNextLevel } from '../../core/growth'
import AssetImage from '../components/AssetImage'
import EquipSlot from '../components/EquipSlot'
import './FleetScreen.css'

// 함선 해금 조건 충족 여부 — ships.json의 unlock 필드 해석
function isShipUnlocked(ship, { conqueredNodeIds, unlockedIds, developed }) {
  const unlock = ship.unlock
  if (!unlock || unlock === 'start') return true
  if (unlock.startsWith('progress:')) return conqueredNodeIds.includes(unlock.split(':')[1])
  if (unlock.startsWith('research:')) {
    const resId = unlock.split(':')[1]
    if (unlockedIds.includes(resId)) return true
    if (resId === 'carrier_ops' && developed.includes('s7')) return true
    return false
  }
  return false
}

function unlockLabel(ship, { conqueredNodeIds, unlockedIds, developed }) {
  const unlock = ship.unlock
  if (!unlock || unlock === 'start') return null
  if (unlock.startsWith('progress:')) {
    const nodeId = unlock.split(':')[1]
    return conqueredNodeIds.includes(nodeId) ? null : `🔒 ${nodeId} 별계 정복 필요`
  }
  if (unlock.startsWith('research:')) {
    const resId = unlock.split(':')[1]
    const via7 = resId === 'carrier_ops' && developed.includes('s7')
    if (unlockedIds.includes(resId) || via7) return null
    if (resId === 'carrier_ops') return '🔒 모함 운용 연구 또는 s7 최종 조선소 개발 필요'
    return `🔒 연구 "${resId}" 필요`
  }
  return null
}

// MOD-10: 에이스 탭 — 보유 에이스 목록 및 함선 배정 UI
function AceTab({ aces, skills, roster, assignAce, recruitedAces, shipsById }) {
  if (!aces || !roster) return null

  return (
    <div className="hub-grid">
      {aces.map((ace) => {
        const isStarting = roster.some((e) => e.aceId === ace.id)
        const isRecruited = recruitedAces.includes(ace.id)
        const isAvailable = isStarting || isRecruited
        const currentShip = roster.find((e) => e.aceId === ace.id)
        const skill = skills?.find((s) => s.id === ace.finisher)
        const buffEntries = Object.entries(ace.fleetBuff ?? {})

        return (
          <div key={ace.id} className={`hub-card${!isAvailable ? ' hub-card--locked' : ''}`}>
            <h4 className="hub-card-title">
              {isAvailable ? '🎖' : '🔒'} {ace.name}
              {isStarting && <span className="hub-card-badge" style={{ marginLeft: 8, fontSize: 9 }}>기본 배정</span>}
              {isRecruited && !isStarting && <span className="hub-card-badge" style={{ marginLeft: 8, fontSize: 9 }}>영입 완료</span>}
            </h4>
            <p className="hub-card-meta">성격: {ace.personality}</p>
            <p className="hub-card-meta">선호 함종: {ace.affinity.join(', ')}</p>
            {skill && <p className="hub-card-meta">필살기: {skill.name} — {skill.desc}</p>}
            {buffEntries.length > 0 && (
              <p className="hub-card-meta">
                함대 버프: {buffEntries.map(([k, v]) => `${k} +${v}`).join(', ')}
              </p>
            )}

            {isAvailable ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p className="hub-card-meta">
                  현재 배정: {currentShip ? shipsById.get(currentShip.shipId)?.name ?? currentShip.shipId : '미배정'}
                </p>
                <select
                  className="equip-slot-select"
                  value={currentShip?.instanceId ?? ''}
                  onChange={(e) => {
                    const newId = e.target.value
                    // 기존 배정 해제
                    if (currentShip) assignAce(currentShip.instanceId, null)
                    // 새 함선에 배정
                    if (newId) assignAce(newId, ace.id)
                  }}
                >
                  <option value="">— 미배정 —</option>
                  {roster.map((entry) => {
                    const ship = shipsById.get(entry.shipId)
                    const otherAce = entry.aceId && entry.aceId !== ace.id
                    if (otherAce) return null // 이미 다른 에이스가 배정된 함선은 선택지에서 제외
                    return (
                      <option key={entry.instanceId} value={entry.instanceId}>
                        {ship?.name ?? entry.shipId} (Lv.{entry.level})
                      </option>
                    )
                  })}
                </select>
              </div>
            ) : (
              <p className="hub-card-meta">
                {ace.recruit
                  ? `🔒 ${ace.joinAt} 전투 후 영입 선택지 (한 번만 기회)`
                  : `합류 조건: ${ace.joinAt} 정복`}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function FleetScreen() {
  const [tab, setTab] = useState('roster')

  const ships = useDataStore((s) => s.data?.ships?.ships)
  const aces = useDataStore((s) => s.data?.aces?.aces)
  const skills = useDataStore((s) => s.data?.skills?.skills)
  const items = useDataStore((s) => s.data?.items)
  const roster = useFleetStore((s) => s.roster)
  const ownedItems = useFleetStore((s) => s.ownedItems)
  const promote = useFleetStore((s) => s.promote)
  const buyShip = useFleetStore((s) => s.buyShip)
  const assignAce = useFleetStore((s) => s.assignAce)
  const unlockedIds = useResearchStore((s) => s.unlockedIds)
  const conqueredNodeIds = useProgressStore((s) => s.conqueredNodeIds)
  const recruitedAces = useProgressStore((s) => s.recruitedAces)
  const developed = useDevelopmentStore((s) => s.developed)
  useResourceStore((s) => s.wallet)

  if (!ships || !aces || !skills || !items) return null

  const shipsById = new Map(ships.map((ship) => [ship.id, ship]))
  const acesById = new Map(aces.map((ace) => [ace.id, ace]))
  const itemsById = new Map(
    ['weapons', 'modules', 'consumables', 'uniques'].flatMap((cat) => items[cat] ?? []).map((i) => [i.id, i]),
  )
  const wallet = useResourceStore.getState().wallet

  return (
    <div className="fleet-screen">
      <div className="fleet-tab-bar">
        <button className={`fleet-tab-btn${tab === 'roster' ? ' active' : ''}`} onClick={() => setTab('roster')}>
          🚀 편성 목록
        </button>
        <button className={`fleet-tab-btn${tab === 'shipyard' ? ' active' : ''}`} onClick={() => setTab('shipyard')}>
          🏭 조선소
        </button>
        <button className={`fleet-tab-btn${tab === 'aces' ? ' active' : ''}`} onClick={() => setTab('aces')}>
          🎖 에이스
        </button>
      </div>

      {tab === 'roster' && (
        <>
          <p className="fleet-hint">
            전투에서 승리하면 생존한 함선 전원이 경험치를 얻어 레벨업(스탯 성장)하고, 전직 조건(레벨)을
            만족하면 아래 카드의 <b>전직</b> 버튼이 활성화됩니다 — 전직하면 스탯이 강화되고 그 함선만의
            고유 필살기가 영구 해금되어, 에이스의 필살기와 함께 전투에서 사용할 수 있습니다.
          </p>
          <div className="fleet-roster">
            {roster.map((entry) => {
              const baseShip = shipsById.get(entry.shipId)
              if (!baseShip) return null

              const ship = applyEquipment(getEffectiveShip(baseShip, entry), entry, itemsById)
              const ace = entry.aceId ? acesById.get(entry.aceId) ?? null : null
              const finishers = getUnitFinishers({ ace, ship: baseShip, entry, allSkills: skills })
              const nextXp = xpToNextLevel(baseShip, entry.level)
              const xpRatio = Number.isFinite(nextXp) ? Math.min(1, entry.xp / nextXp) : 1
              const eligible = canPromote(baseShip, entry)

              return (
                <article className={`fleet-card${ship.promoted ? ' fleet-card--promoted' : ''}`} key={entry.instanceId}>
                  <header className="fleet-card-head">
                    <AssetImage assetKey={baseShip.sprite} alt={ship.name} className="fleet-card-icon" />
                    <div>
                      <h3 className="fleet-card-name">
                        {ship.name} <span className="fleet-card-level">Lv.{ship.level}</span>
                        {ship.promoted && <span className="fleet-card-badge">전직 완료</span>}
                      </h3>
                      <p className="fleet-card-role">
                        {baseShip.role}
                        {ace && ` · 지휘관 ${ace.name} (${ace.personality})`}
                      </p>
                    </div>
                  </header>

                  <div className="fleet-xp-row">
                    <div className="fleet-xp-bar">
                      <div className="fleet-xp-fill" style={{ width: `${xpRatio * 100}%` }} />
                    </div>
                    <span className="fleet-xp-label">
                      XP {entry.xp} / {Number.isFinite(nextXp) ? nextXp : '—'}
                    </span>
                  </div>

                  <table className="fleet-stat-table">
                    <tbody>
                      <tr>
                        <th>HP</th><td>{baseShip.hp} → <b>{ship.hp}</b></td>
                        <th>ATK</th><td>{baseShip.atk} → <b>{ship.atk}</b></td>
                      </tr>
                      <tr>
                        <th>DEF</th><td>{baseShip.def} → <b>{ship.def}</b></td>
                        <th>ACC</th><td>{baseShip.acc} → <b>{ship.acc}</b></td>
                      </tr>
                      <tr>
                        <th>EVA</th><td>{baseShip.eva} → <b>{ship.eva}</b></td>
                        <th>MOV</th><td>{baseShip.mov} → <b>{ship.mov}</b></td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="equip-slots">
                    <EquipSlot entry={entry} slot="weapon" itemsById={itemsById} ownedItems={ownedItems} />
                    <EquipSlot entry={entry} slot="module" itemsById={itemsById} ownedItems={ownedItems} />
                  </div>

                  {finishers.length > 0 && (
                    <ul className="fleet-finisher-list">
                      {finishers.map(({ skill, presenterName, source }) => (
                        <li key={skill.id}>
                          <span className={`fleet-finisher-tag fleet-finisher-tag--${source}`}>
                            {source === 'ace' ? '에이스 필살기' : '전직 고유 필살기'}
                          </span>
                          <strong>{skill.name}</strong>
                          <span className="fleet-finisher-desc"> — {skill.desc} ({presenterName})</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {baseShip.promotion && !ship.promoted && (
                    <button className="fleet-promote-btn" disabled={!eligible} onClick={() => promote(entry.instanceId)}>
                      {eligible
                        ? `✨ "${baseShip.promotion.name}"(으)로 전직!`
                        : `전직 조건 — Lv.${baseShip.promotion.requireLevel} 필요 (현재 Lv.${entry.level})`}
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      {tab === 'shipyard' && (
        <div className="shipyard">
          <p className="fleet-hint">
            해금 조건을 충족한 함선을 스텔라크레딧(SC)으로 구매해 편성에 추가합니다.
            전함(battleship)은 s4 정복, 모함(carrier)은 모함 운용 연구 또는 s7 최종 조선소 개발 후 구매 가능합니다.
          </p>
          <div className="fleet-roster">
            {ships.map((ship) => {
              const locked = !isShipUnlocked(ship, { conqueredNodeIds, unlockedIds, developed })
              const lockReason = unlockLabel(ship, { conqueredNodeIds, unlockedIds, developed })
              const affordable = (wallet.sc ?? 0) >= (ship.cost ?? 0)
              return (
                <article key={ship.id} className={`fleet-card${locked ? ' fleet-card--locked' : ''}`}>
                  <header className="fleet-card-head">
                    <AssetImage assetKey={ship.sprite} alt={ship.name} className="fleet-card-icon" />
                    <div>
                      <h3 className="fleet-card-name">{ship.name}</h3>
                      <p className="fleet-card-role">{ship.role}</p>
                    </div>
                  </header>
                  <table className="fleet-stat-table">
                    <tbody>
                      <tr>
                        <th>HP</th><td>{ship.hp}</td>
                        <th>ATK</th><td>{ship.atk}</td>
                        <th>DEF</th><td>{ship.def}</td>
                      </tr>
                      <tr>
                        <th>ACC</th><td>{ship.acc}</td>
                        <th>EVA</th><td>{ship.eva}</td>
                        <th>MOV</th><td>{ship.mov}</td>
                      </tr>
                    </tbody>
                  </table>
                  {locked ? (
                    <p className="shipyard-lock-msg">{lockReason}</p>
                  ) : (
                    <button
                      className="fleet-promote-btn"
                      disabled={!affordable}
                      onClick={() => buyShip(ship.id)}
                    >
                      {affordable
                        ? `🏭 건조 — 💰 ${ship.cost} SC`
                        : `⚠ SC 부족 (필요 ${ship.cost}, 보유 ${wallet.sc ?? 0})`}
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'aces' && (
        <>
          <p className="fleet-hint">
            에이스 지휘관은 배정된 함선에 필살기와 함대 버프를 부여합니다. 영입한 에이스는 아래에서
            원하는 함선에 배정할 수 있습니다. 레이븐(Raven)은 s6 전투 후 영입 선택지가 한 번만 나타납니다.
          </p>
          <AceTab
            aces={aces}
            skills={skills}
            roster={roster}
            assignAce={assignAce}
            recruitedAces={recruitedAces}
            shipsById={shipsById}
          />
        </>
      )}
    </div>
  )
}
