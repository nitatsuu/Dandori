import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './styles/tokens.css'
import './styles/base.css'

/*
 * A new build reaches the running app only if someone asks for it. The browser
 * looks for a new worker on navigation, and an app installed on the phone is
 * resumed rather than navigated for days on end — so ask on a timer as well.
 * Once the new worker activates the page reloads itself; work in progress is
 * already in IndexedDB by then, the reload takes nothing with it.
 */
const UPDATE_EVERY_MS = 60 * 60 * 1000

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    setInterval(() => void registration.update(), UPDATE_EVERY_MS)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
