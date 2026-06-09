import { useResourceStore } from '../../state/useResourceStore'
import { useDataStore } from '../../state/useDataStore'

const RESOURCE_ICONS = { sc: '💰', ti: '🔩', ec: '💎', dm: '🌑' }

export default function ResourceHud({ sidebar = false }) {
  const wallet = useResourceStore((s) => s.wallet)
  const resources = useDataStore((s) => s.data?.resources?.resources)
  if (!resources) return null
  return (
    <div className={`resource-hud${sidebar ? ' resource-hud--sidebar' : ''}`}>
      {resources.map((r) => (
        <span key={r.id} className="resource-hud-item">
          <span className="resource-hud-icon">{RESOURCE_ICONS[r.id] ?? '📦'}</span>
          <span className="resource-hud-name">{r.name}</span>
          <span className="resource-hud-value">{wallet[r.id] ?? 0}</span>
        </span>
      ))}
    </div>
  )
}
