import { useResourceStore } from '../../state/useResourceStore'
import { useDataStore } from '../../state/useDataStore'

const RESOURCE_ICONS = { sc: '💰', ti: '🔩', ec: '💎', dm: '🌑', nc: '🧬', qd: '📡' }

export default function ResourceHud({ sidebar = false, compact = false }) {
  const wallet = useResourceStore((s) => s.wallet)
  const resources = useDataStore((s) => s.data?.resources?.resources)
  if (!resources) return null
  const cls = ['resource-hud']
  if (sidebar) cls.push('resource-hud--sidebar')
  if (compact) cls.push('resource-hud--compact')
  return (
    <div className={cls.join(' ')}>
      {resources.map((r) => (
        <span key={r.id} className="resource-hud-item" title={r.name}>
          <span className="resource-hud-icon">{RESOURCE_ICONS[r.id] ?? '📦'}</span>
          <span className="resource-hud-name">{r.name}</span>
          <span className="resource-hud-value">{wallet[r.id] ?? 0}</span>
        </span>
      ))}
    </div>
  )
}
