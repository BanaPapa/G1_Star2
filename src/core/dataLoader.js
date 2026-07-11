// src/data/*.json 을 앱 시작 시 불러온다. (game_data_dictionary.md 1:1 대응)
// eager: true — story.json/systems.json이 스토어에서 정적 import되어 lazy glob이 무효
// (INEFFECTIVE_DYNAMIC_IMPORT 경고)였으므로, 데이터 JSON(~35kB)을 정적 로드로 통일한다.
const dataModules = import.meta.glob('../data/*.json', { eager: true })
const KEY_FROM_PATH = /\/(\w+)\.json$/

// onProgress({ key, loaded, total, ratio })를 매 파일 로드마다 호출한다.
// 정적 로드지만 시그니처(async)와 반환 형태·진행 콜백 인터페이스는 유지(호출부·LoadingScreen 무변경).
export async function loadGameData(onProgress) {
  const entries = Object.entries(dataModules)
  const total = entries.length
  const data = {}
  let loaded = 0

  for (const [path, mod] of entries) {
    const [, key] = path.match(KEY_FROM_PATH)
    data[key] = mod.default
    loaded += 1
    onProgress?.({ key, loaded, total, ratio: loaded / total })
  }

  return data
}
