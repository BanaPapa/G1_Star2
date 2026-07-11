// 전투 카드용 인라인 SVG 아이콘 세트 — 이모지 대신 크리스프한 단색 실루엣(currentColor로 계열색 틴트).
// 함급별 함선 실루엣 6종 + 스탯(ATK/MOV) + 무기 계열 5종. viewBox 24×24, 노즈 위쪽.

const S = { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true }

// ── 함급 실루엣 (경량→중량 순으로 폭·각짐 증가) ─────────────────────────
const SHIP_PATHS = {
  // 건십 — 날렵한 인터셉터(가는 다트 + 작은 핀)
  gunship: 'M12 2c1 1.6 1.8 4 2 7l.6 8-1.8 1.4h-1.6L9.4 17l.6-8c.2-3 1-5.4 2-7Zm-3.4 9L6 13.6l.4 2.2 2.6-1.6Zm6.8 0 2.6 2.6-.4 2.2-2.6-1.6Z',
  // 프리깃 — 후퇴익 화살촉
  frigate: 'M12 2.5c1.4 1.8 2.3 4.6 2.5 8l.3 4 2.7 3.2v2.3l-3.8-1.7-.4 2.4h-2.6l-.4-2.4L6.5 22v-2.3l2.7-3.2.3-4c.2-3.4 1.1-6.2 2.5-8Z',
  // 순양함 — 길쭉한 다이아 선체 + 측면 포드
  cruiser: 'M12 2c1.3 2 2 5 2 9v8.5l-2 2-2-2V11c0-4 .7-7 2-9ZM8 9 5.6 11l.2 5L8 14.6Zm8 0 2.4 2-.2 5L16 14.6Z',
  // 구축함 — 중장 웨지(각진 후미)
  destroyer: 'M12 2.4 15 8v3.5l2.6 1.4v3.2l-2.6-.7v3l1.4 1.9-1.6.8-.8-1.4h-2l-.8 1.4-1.6-.8L9 18.4v-3l-2.6.7V13L9 11.5V8Z',
  // 배틀크루저 — 넓은 델타 + 프롱
  battlecruiser: 'M12 2c1.5 2.2 2.4 5.4 2.6 9.4l4.4 3.4v2.4l-4.4-1.8v3.4l1.4 1.6-1.6.9-.8-1.3h-2.4l-.8 1.3-1.6-.9 1.4-1.6v-3.4L5 17.2v-2.4l4.4-3.4C9.6 7.4 10.5 4.2 12 2Z',
  // 배틀십 — 거대 블록 선체 + 포탑 노치
  battleship: 'M12 2c1.4 1.8 2.2 4.4 2.4 7.6l5.1 2.2v3l-5-1.2.1 3.2 1.6 2.4-1.9 1-.9-1.6h-3l-.9 1.6-1.9-1 1.6-2.4.1-3.2-5 1.2v-3l5.1-2.2C9.8 6.4 10.6 3.8 12 2Z',
}
const SHIP_FALLBACK = SHIP_PATHS.cruiser

export function ShipGlyph({ shipClass }) {
  const d = SHIP_PATHS[shipClass] ?? SHIP_FALLBACK
  return <svg {...S}><path d={d} /></svg>
}

// ── 스탯 아이콘 ────────────────────────────────────────────────────────
export function AtkIcon() {
  // 조준 버스트(십자 + 중심점)
  return (
    <svg {...S}>
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <circle cx="12" cy="12" r="1.8" />
    </svg>
  )
}
export function MovIcon() {
  // 이중 셰브론(추진)
  return (
    <svg {...S}>
      <path d="M5 13l7-7 7 7M5 18l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

// ── 무기 계열 아이콘 ───────────────────────────────────────────────────
const WEAPON_SVG = {
  laser: <path d="M3 12h13m0 0-3-2.5M16 12l-3 2.5M18 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  ion: <path d="M13 2 5 13h5l-1 9 8-12h-5l1-8Z" />,
  plasma: <path d="M12 2c2 3 5 5 5 9a5 5 0 0 1-10 0c0-1.5.6-2.8 1.5-3.8C9 9 10 8 12 2Z" />,
  gravity: <g fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" /><ellipse cx="12" cy="12" rx="9" ry="4" /><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)" /></g>,
  antimatter: <g><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2.4" /><path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></g>,
}
export function WeaponIcon({ family }) {
  return <svg {...S}>{WEAPON_SVG[family] ?? <path d="M6 18 18 6m-9 0h9v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />}</svg>
}
