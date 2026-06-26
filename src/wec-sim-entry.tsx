import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import WECSimPage from './components/international/WECSimPage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <WECSimPage />
    </MemoryRouter>
  </StrictMode>
)
