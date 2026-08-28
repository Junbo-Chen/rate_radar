import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { purgeLegacyLocalCredentials } from './api/credentials.ts'
import './index.css'
import App from './App.tsx'

purgeLegacyLocalCredentials()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
