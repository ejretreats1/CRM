import { useEffect, useState } from 'react';

export default function CleanerSetupPage({ combined }: { combined: string }) {
  const [state, setState] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function go() {
      try {
        const r = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            flow: 'cleaner',
            action: 'connect-url',
            combined,
            appUrl: window.location.origin,
          }),
        });
        const d = await r.json();
        if (!r.ok) { setErrorMsg(d.error ?? 'Could not load setup link.'); setState('error'); return; }
        window.location.href = d.url;
      } catch {
        setErrorMsg('Failed to load. Please try again.');
        setState('error');
      }
    }
    go();
  }, [combined]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-5xl animate-pulse">💳</div>
          <p className="text-gray-700 font-semibold text-lg">Preparing your Stripe setup…</p>
          <p className="text-gray-400 text-sm">You'll be redirected to Stripe in a moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">❌</div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Link error</h2>
        <p className="text-gray-500 text-sm mb-4">{errorMsg}</p>
        <p className="text-gray-400 text-xs">Contact E&amp;J Retreats if this keeps happening.</p>
      </div>
    </div>
  );
}
