import { useEffect, useState } from 'react';

type State = 'loading' | 'done' | 'pending' | 'error';

export default function CleanerConnectPage({ combined }: { combined: string }) {
  const [state, setState] = useState<State>('loading');
  const [cleanerName, setCleanerName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function verify() {
      try {
        const r = await fetch(
          `/api/documents?flow=cleaner-connect&combined=${encodeURIComponent(combined)}`
        );
        const d = await r.json();
        if (!r.ok) { setErrorMsg(d.error ?? 'Verification failed.'); setState('error'); return; }
        setCleanerName(d.name ?? '');
        setState(d.detailsSubmitted ? 'done' : 'pending');
      } catch {
        setErrorMsg('Failed to verify. Please try again.');
        setState('error');
      }
    }
    verify();
  }, [combined]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Verifying your Stripe setup…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Something went wrong</h2>
          <p className="text-gray-500 text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (state === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">⏳</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Almost there!</h2>
          <p className="text-gray-500 text-sm">
            Your Stripe account setup is still in progress. Stripe may have sent you a follow-up email with additional steps. Once complete, your payouts will be activated automatically.
          </p>
          <p className="text-gray-400 text-xs mt-4">You can close this window.</p>
        </div>
      </div>
    );
  }

  const firstName = cleanerName ? cleanerName.split(' ')[0] : '';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          You're all set{firstName ? `, ${firstName}` : ''}!
        </h2>
        <p className="text-gray-500 text-sm">
          Your Stripe account is connected. E&amp;J Retreats will automatically send your cleaning payouts to your bank account after each completed job — no action needed.
        </p>
        <p className="text-gray-400 text-xs mt-4">You can close this window.</p>
      </div>
    </div>
  );
}
