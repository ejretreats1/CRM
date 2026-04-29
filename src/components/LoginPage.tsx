import { SignIn } from '@clerk/clerk-react';
import { Building2 } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-slate-100 flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center shadow-lg">
          <Building2 size={28} className="text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">E&J Retreats</h1>
          <p className="text-sm text-slate-500 mt-0.5">CRM Portal</p>
        </div>
      </div>

      <SignIn
        appearance={{
          elements: {
            rootBox: 'w-full max-w-md',
            card: 'shadow-xl border border-slate-200 rounded-2xl',
            headerTitle: 'text-slate-900',
            headerSubtitle: 'text-slate-500',
            socialButtonsBlockButton: 'border border-slate-200 rounded-lg',
            formButtonPrimary: 'bg-teal-600 hover:bg-teal-700 text-sm',
            footerActionLink: 'text-teal-600 hover:text-teal-700',
          },
        }}
      />
    </div>
  );
}
