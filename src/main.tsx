import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import './index.css';
import App from './App.tsx';
import SignPage from './pages/SignPage.tsx';
import AgreementFillPage from './components/AgreementFillPage.tsx';
import TemplateSignPage from './components/TemplateSignPage.tsx';
import OnboardingPage from './components/OnboardingPage.tsx';
import CleanerDashboard from './components/CleanerDashboard.tsx';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const path = window.location.pathname;
const searchParams      = new URLSearchParams(window.location.search);
const signMatch         = path.match(/^\/sign\/([^/]+)/);
const fillMatch         = path.match(/^\/fill\/([^/]+)/);
const signTemplateMatch = path.match(/^\/sign-template\/([^/]+)/);
const onboardingToken   = searchParams.get('onboarding');
const cleanerDashboardId = searchParams.get('cleaner-dashboard');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {signMatch ? (
      <SignPage token={signMatch[1]} />
    ) : fillMatch ? (
      <AgreementFillPage token={fillMatch[1]} />
    ) : signTemplateMatch ? (
      <TemplateSignPage shareToken={signTemplateMatch[1]} />
    ) : onboardingToken ? (
      <OnboardingPage token={onboardingToken} />
    ) : cleanerDashboardId ? (
      <CleanerDashboard cleanerId={cleanerDashboardId} />
    ) : (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    )}
  </StrictMode>,
);
