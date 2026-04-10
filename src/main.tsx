import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import SignPage from './pages/SignPage.tsx'

const path = window.location.pathname;
const signMatch = path.match(/^\/sign\/([^/]+)/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {signMatch ? <SignPage token={signMatch[1]} /> : <App />}
  </StrictMode>,
)
