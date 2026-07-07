import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// dev 전용 E2E 훅 — window.__battleScene처럼 헤드리스 테스트에서 앱과 같은 스토어 인스턴스에 접근.
// (동적 import는 HMR 버전 쿼리 때문에 별도 인스턴스가 생겨 실제 앱 상태를 못 건드린다)
if (import.meta.env.DEV) {
  Promise.all([
    import('./state/useProgressStore'),
    import('./state/useStoryStore'),
  ]).then(([p, s]) => {
    window.__progressStore = p.useProgressStore
    window.__storyStore = s.useStoryStore
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
