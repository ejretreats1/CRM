// The signed-in CRM. Loaded lazily from main.tsx so public pages (cleaner
// portal, client onboarding, e-sign) never download the CRM bundle or Clerk.
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.tsx';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function CrmApp() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  );
}
