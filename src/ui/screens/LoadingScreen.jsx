export default function LoadingScreen({ progress, currentKey, status }) {
  const percent = Math.round(progress * 100)
  const label =
    status === 'error'
      ? '데이터 로드 실패 — 콘솔(F12)을 확인하세요.'
      : currentKey
        ? `데이터 로딩 중... ${currentKey}.json (${percent}%)`
        : `로딩 중... (${percent}%)`

  return (
    <div className="loading-screen">
      <div className="loading-logo">
        7<span className="accent">★</span> STAR
      </div>
      <div className="loading-bar">
        <div className="loading-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="loading-label">{label}</div>
    </div>
  )
}
