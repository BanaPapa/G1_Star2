// 에셋 키 → /public/assets PNG 경로 매핑.
// PNG가 없으면(아직 그록으로 제작 전) 카테고리별 이모지로 폴백한다.
// (docs/game_data_dictionary.md 12장 애셋 체크리스트의 파일 키 규칙을 따른다)

const ASSET_BASE = '/assets/'

// 키 접두사를 검사하는 순서가 중요하다 — 더 구체적인 규칙을 먼저 둔다.
const EMOJI_RULES = [
  // hull_ 방향별 스프라이트 — PNG가 없을 때 이모지로 폴백
  [/^hull_gunship/, '🛸'],
  [/^hull_frigate/, '🚀'],
  [/^hull_cruiser/, '🚢'],
  [/^hull_/, '✈️'],

  [/^unit_gunship/, '🛸'],
  [/^unit_frigate/, '🚀'],
  [/^unit_cruiser/, '🚢'],
  [/^unit_destroyer/, '🛰️'],
  [/^unit_battleship/, '🛡️'],
  [/^unit_battlecruiser/, '🌌'],
  [/^unit_drone/, '🤖'],
  [/^unit_thorn/, '🦔'],
  [/^unit_/, '✈️'],

  [/^boss_garr/, '👹'],
  [/^boss_warden/, '👁️'],
  [/^boss_/, '💀'],

  [/^ace_kai/, '🔥'],
  [/^ace_sera/, '❄️'],
  [/^ace_mila/, '🔧'],
  [/^ace_raven/, '🌑'],
  [/^ace_/, '🧑‍🚀'],
  [/^cutin_/, '✨'],

  [/^fx_slash/, '⚔️'],
  [/^fx_beam/, '🔫'],
  [/^fx_explosion/, '💥'],
  [/^fx_shield/, '🛡️'],
  [/^fx_/, '💫'],

  [/^res_sc/, '💰'],
  [/^res_ti/, '🔩'],
  [/^res_ec/, '🔷'],
  [/^res_dm/, '🟣'],
  [/^res_/, '⬡'],

  [/^item_/, '📦'],
  [/^tech_/, '🔬'],

  [/^tile_void/, '⬛'],
  [/^tile_asteroid/, '🪨'],
  [/^tile_debris/, '🗑️'],
  [/^tile_nebula/, '🌫️'],
  [/^tile_mine/, '⛏️'],
  [/^tile_/, '▫️'],

  [/^bg_/, '🌌'],
  [/^logo|^appicon/, '⭐'],
]

const DEFAULT_EMOJI = '❔'

export function getAssetUrl(key) {
  return `${ASSET_BASE}${key}.png`
}

export function getEmojiFallback(key) {
  const rule = EMOJI_RULES.find(([pattern]) => pattern.test(key))
  return rule ? rule[1] : DEFAULT_EMOJI
}

// 컴포넌트에서: const { url, emoji } = getAsset('unit_gunship_ally')
// <img src={url} onError={...emoji 표시...}>
export function getAsset(key) {
  return { url: getAssetUrl(key), emoji: getEmojiFallback(key) }
}
