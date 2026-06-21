// Battle Map Editor — map/ 폴더의 배경 이미지 연동(개발 서버 미들웨어 vite.config.js).
// 목록 조회(listMapImages) · 업로드(uploadMapImage) · 제공 URL(mapImageUrl)을 제공한다.
// 개발 서버가 없으면(빌드 미리보기 등) 목록은 빈 배열, 업로드는 ok:false를 돌려준다.

export const mapImageUrl = (name) => `/__maps/file/${encodeURIComponent(name)}`

// 확장자를 뗀 표시 이름.
export const imageBaseName = (name) => name.replace(/\.[^.]+$/, '')

// 이름 슬러그(소문자·구분자 _).
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '_').replace(/^_+|_+$/g, '')

// 파일명 → 안정적인 맵 id. 카테고리(type)가 있으면 map_<type>_<slug>, 없으면(기타) map_<slug>.
// type ∈ 'normal'|'special'|'elite'|'boss'|null
export const mapIdFromImage = (name, type = null) => {
  const slug = slugify(imageBaseName(name))
  return type ? `map_${type}_${slug}` : `map_${slug}`
}

// map/ 폴더의 파일명 변경(카테고리 재분류 시 저장 그리드 json). { ok } 또는 { ok:false, error }.
export async function renameMapFile(from, to) {
  try {
    const res = await fetch('/__maps/rename', {
      method: 'POST',
      headers: { 'X-From': encodeURIComponent(from), 'X-To': encodeURIComponent(to) },
    })
    return await res.json()
  } catch (e) { return { ok: false, error: String(e) } }
}

// map/ 폴더의 이미지 목록 [{ name, url }]. 실패 시 빈 배열.
export async function listMapImages() {
  try {
    const res = await fetch('/__maps/list')
    if (!res.ok) return []
    const data = await res.json()
    return (data.files ?? []).map((name) => ({ name, url: mapImageUrl(name) }))
  } catch { return [] }
}

// 이미지 파일을 map/ 폴더로 업로드(=이동). { ok, file } 또는 { ok:false, error }.
export async function uploadMapImage(file) {
  try {
    const res = await fetch('/__maps/upload', {
      method: 'POST',
      headers: { 'X-Filename': encodeURIComponent(file.name) },
      body: file,
    })
    return await res.json()
  } catch (e) { return { ok: false, error: String(e) } }
}

// 저장된 그리드 맵(JSON)을 map/ 폴더에 <id>.json 으로 기록.
export async function saveMapJson(id, mapObject) {
  try {
    const res = await fetch('/__maps/save-json', {
      method: 'POST',
      headers: { 'X-Filename': encodeURIComponent(`${id}.json`), 'Content-Type': 'application/json' },
      body: JSON.stringify(mapObject, null, 2),
    })
    return await res.json()
  } catch (e) { return { ok: false, error: String(e) } }
}

// map/ 폴더의 파일 삭제(이미지명 또는 <id>.json).
export async function deleteMapFile(filename) {
  try {
    const res = await fetch('/__maps/delete', {
      method: 'POST',
      headers: { 'X-Filename': encodeURIComponent(filename) },
    })
    return await res.json()
  } catch (e) { return { ok: false, error: String(e) } }
}
