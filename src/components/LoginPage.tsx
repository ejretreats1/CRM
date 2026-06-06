import { SignIn } from '@clerk/clerk-react';
import { Building2 } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-slate-100 flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-[#4a90d9] flex items-center justify-center shadow-lg">
          <Building2 size={28} className="text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">E&J Retreats</h1>
          <p className="text-sm text-[#b8d4f0] mt-0.5">CRM Portal</p>
        </div>
      </div>

      <SignIn
        appearance={{
          elements: {
            rootBox: 'w-full max-w-md',
            card: 'shadow-xl border border-[#1e2d45] rounded-2xl',
            headerTitle: 'text-white',
            headerSubtitle: 'text-[#b8d4f0]',
            socialButtonsBlockButton: 'border border-[#1e2d45] rounded-lg',
            formButtonPrimary: 'bg-[#4a90d9] hover:bg-[#3a80c9] text-sm',
            footerActionLink: 'text-[#4a90d9] hover:text-[#4a90d9]',
          },
        }}
      />
    </div>
  );
}
