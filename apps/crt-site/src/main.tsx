import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@ldlework/phosphor/styles.css'
import './site.css'
import { App } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('no #root')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
