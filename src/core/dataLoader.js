// src/data/*.json 을 앱 시작 시 비동기로 불러온다. (game_data_dictionary.md 1:1 대응)
const dataModules = import.meta.glob('../data/*.json')
const KEY_FROM_PATH = /\/(\w+)\.json$/

// onProgress({ key, loaded, total, ratio })를 매 파일 로드마다 호출한다.
export async function loadGameData(onProgress) {
  const entries = Object.entries(dataModules)
  const total = entries.length
  const data = {}
  let loaded = 0

  for (const [path, importModule] of entries) {
    const [, key] = path.match(KEY_FROM_PATH)
    const mod = await importModule()
    data[key] = mod.default
    loaded += 1
    onProgress?.({ key, loaded, total, ratio: loaded / total })
  }

  return data
}
