import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/inter'
import App from './App.tsx'
import { isNative, setUpNativeChrome } from './lib/native'
import { useGameStore } from './store/gameStore'
import './styles/global.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element missing')

function render() {
  createRoot(root!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  void setUpNativeChrome()
}

// Native storage loads asynchronously; wait for saved games before the first paint.
if (isNative && !useGameStore.persist.hasHydrated()) useGameStore.persist.onFinishHydration(render)
else render()
