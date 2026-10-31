import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@montage-ui/core/global.css'
import './shared/styles/fonts.css'
import './shared/styles/app.css'
import App from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
