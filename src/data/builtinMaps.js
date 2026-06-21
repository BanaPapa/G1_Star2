// 작업폴더 루트의 map/ 폴더에 있는 모든 *.json 전투맵을 빌드 시 자동 로드한다.
// 사용자는 map/ 폴더에 mapDefinition JSON을 떨어뜨리기만 하면 별도 저장 없이 에디터·전투에서 사용 가능.
// (Vite import.meta.glob — 절대 경로 '/map/*.json'은 프로젝트 루트 기준)
const modules = import.meta.glob('/map/*.json', { eager: true })

export const BUILTIN_MAPS = {}
for (const path in modules) {
  const m = modules[path]?.default ?? modules[path]
  if (m && m.id && m.grid && m.tiles) BUILTIN_MAPS[m.id] = m
}
