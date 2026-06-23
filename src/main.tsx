import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import './index.css';
import App from './App.tsx';
import SignPage from './pages/SignPage.tsx';
import AgreementFillPage from './components/AgreementFillPage.tsx';
import OnboardingPage from './components/OnboardingPage.tsx';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const path = window.location.pathname;
const signMatch = path.match(/^\/sign\/([^/]+)/);
const fillMatch = path.match(/^\/fill\/([^/]+)/);
const onboardingToken = new URLSearchParams(window.location.search).get('onboarding');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {signMatch ? (
      <SignPage token={signMatch[1]} />
    ) : fillMatch ? (
      <AgreementFillPage token={fillMatch[1]} />
    ) : onboardingToken ? (
      <OnboardingPage token={onboardingToken} />
    ) : (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    )}
  </StrictMode>,
);
