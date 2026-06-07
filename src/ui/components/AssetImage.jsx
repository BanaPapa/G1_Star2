import { useState } from 'react'
import { getAsset } from '../../core/assetMap'

// assetKey의 PNG가 /public/assets에 있으면 표시하고, 없으면(로드 실패) 이모지로 대체한다.
export default function AssetImage({ assetKey, alt = '', className, style }) {
  const { url, emoji } = getAsset(assetKey)
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span className={className} style={style} role="img" aria-label={alt || assetKey}>
        {emoji}
      </span>
    )
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      style={style}
      onError={() => setFailed(true)}
    />
  )
}
