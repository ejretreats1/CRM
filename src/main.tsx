import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import './index.css';
import App from './App.tsx';
import SignPage from './pages/SignPage.tsx';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const path = window.location.pathname;
const signMatch = path.match(/^\/sign\/([^/]+)/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {signMatch ? (
      <SignPage token={signMatch[1]} />
    ) : (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    )}
  </StrictMode>,
);
