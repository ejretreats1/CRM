import { StrictMode, Suspense, lazy, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Every route is its own chunk. A cleaner opening their portal on a phone gets
// a few hundred KB, not the whole CRM + Clerk; the CRM itself is unchanged.
const CrmApp                       = lazy(() => import('./CrmApp.tsx'));
const SignPage                     = lazy(() => import('./pages/SignPage.tsx'));
const AgreementFillPage            = lazy(() => import('./components/AgreementFillPage.tsx'));
const TemplateSignPage             = lazy(() => import('./components/TemplateSignPage.tsx'));
const OnboardingPage               = lazy(() => import('./components/OnboardingPage.tsx'));
const CleanerDashboard             = lazy(() => import('./components/CleanerDashboard.tsx'));
const CleanerPortalPage            = lazy(() => import('./components/CleanerPortalPage.tsx'));
const CleaningClientOnboardingPage = lazy(() => import('./components/CleaningClientOnboardingPage.tsx'));
const CleaningPropertyEnrollPage   = lazy(() => import('./components/CleaningPropertyEnrollPage.tsx'));
const CleanerOnboardingPage        = lazy(() => import('./components/CleanerOnboardingPage.tsx'));
const CleanerSetupPage             = lazy(() => import('./components/CleanerSetupPage.tsx'));
const CleanerConnectPage           = lazy(() => import('./components/CleanerConnectPage.tsx'));

const path = window.location.pathname;
const q = new URLSearchParams(window.location.search);
const signMatch         = path.match(/^\/sign\/([^/]+)/);
const fillMatch         = path.match(/^\/fill\/([^/]+)/);
const signTemplateMatch = path.match(/^\/sign-template\/([^/]+)/);

function pick(): { node: ReactNode; dark: boolean; title?: string } {
  const p = (k: string) => q.get(k);
  if (signMatch)                 return { node: <SignPage token={signMatch[1]} />, dark: false };
  if (fillMatch)                 return { node: <AgreementFillPage token={fillMatch[1]} />, dark: false };
  if (signTemplateMatch)         return { node: <TemplateSignPage shareToken={signTemplateMatch[1]} />, dark: false };
  if (p('onboarding'))           return { node: <OnboardingPage token={p('onboarding')!} />, dark: false };
  if (p('cleaner-dashboard'))    return { node: <CleanerDashboard combined={p('cleaner-dashboard')!} />, dark: true, title: 'Cleaner Portal · E&J Retreats' };
  if (p('cleaner'))              return { node: <CleanerPortalPage combined={p('cleaner')!} />, dark: true, title: 'Cleaning Job · E&J Retreats' };
  if (p('cleaning-onboard'))     return { node: <CleaningClientOnboardingPage token={p('cleaning-onboard')!} />, dark: false, title: 'Set up cleaning · E&J Retreats' };
  if (p('cleaning-enroll'))      return { node: <CleaningPropertyEnrollPage token={p('cleaning-enroll')!} />, dark: false, title: 'Enroll your property · E&J Retreats' };
  if (p('cleaner-onboard'))      return { node: <CleanerOnboardingPage token={p('cleaner-onboard')!} />, dark: false, title: 'Contractor Agreement · E&J Retreats' };
  if (p('cleaner-setup'))        return { node: <CleanerSetupPage combined={p('cleaner-setup')!} />, dark: true };
  if (p('cleaner-connected'))    return { node: <CleanerConnectPage combined={p('cleaner-connected')!} />, dark: true };
  return { node: <CrmApp />, dark: true };
}

const route = pick();
if (route.title) document.title = route.title;

function Splash({ dark }: { dark: boolean }) {
  return (
    <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-[#0a1628]' : 'bg-gray-50'}`}>
      <div className={`w-7 h-7 rounded-full border-2 border-t-transparent animate-spin ${dark ? 'border-[#4a90d9]' : 'border-blue-700'}`} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<Splash dark={route.dark} />}>
      {route.node}
    </Suspense>
  </StrictMode>,
);
