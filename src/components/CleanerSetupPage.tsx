import { useEffect, useState } from 'react';

const CLEANER_AGREEMENT = `E&J Retreats Cleaner Service Agreement

By connecting your payout account, you agree to the following terms:

1. SERVICES — You agree to professionally clean assigned properties after each guest checkout. All work must meet E&J Retreats' quality standards and the provided cleaning checklist.

2. PHOTO REPORT — A photo report must be submitted through the cleaner portal after every completed job. This is required before your payout is processed.

3. PAYOUT TIMING — Your payout is sent automatically 2 business days + 2 hours after the client charge is processed. The client is charged on the guest checkout date. You will receive funds in your bank account within 1–2 business days after your payout is initiated.

   Example: Guest checks out Monday → Client charged Monday 12pm ET → Your payout sent Thursday → Funds in your bank Friday or the following Monday.

4. PAYOUT METHOD — Payouts are sent via Stripe to the bank account you connect during setup. You are responsible for keeping your Stripe account active and your banking details current.

5. QUALITY — If a cleaning does not meet standards, E&J Retreats may request a re-clean at no additional charge. Repeated quality issues may result in removal from the network.

6. DAMAGE — Any damage observed during cleaning must be documented with photos and reported immediately through the portal. Damage caused by the cleaner is the cleaner's responsibility.

7. CANCELLATION — Either party may end this arrangement with 7 days notice. Jobs already dispatched must be completed or declined promptly.`;

export default function CleanerSetupPage({ combined }: { combined: string }) {
  const [state, setState] = useState<'loading' | 'agreement' | 'redirecting' | 'error'>('loading');
  const [cleanerName, setCleanerName] = useState('');
  const [stripeUrl, setStripeUrl] = useState('');
  const [agreed, setAgreed] = useState(false);
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
        setStripeUrl(d.url);
        setCleanerName(d.cleanerName ?? '');
        setState('agreement');
      } catch {
        setErrorMsg('Failed to load. Please try again.');
        setState('error');
      }
    }
    go();
  }, [combined]);

  function handleAgreeAndContinue() {
    if (!agreed || !stripeUrl) return;
    setState('redirecting');
    window.location.href = stripeUrl;
  }

  if (state === 'loading') {
    return (
      <div className="h-screen overflow-y-auto bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-5xl animate-pulse">💳</div>
          <p className="text-gray-700 font-semibold text-lg">Loading your setup…</p>
        </div>
      </div>
    );
  }

  if (state === 'redirecting') {
    return (
      <div className="h-screen overflow-y-auto bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-5xl animate-pulse">💳</div>
          <p className="text-gray-700 font-semibold text-lg">Preparing your Stripe setup…</p>
          <p className="text-gray-400 text-sm">You'll be redirected in a moment.</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="h-screen overflow-y-auto bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Link error</h2>
          <p className="text-gray-500 text-sm mb-4">{errorMsg}</p>
          <p className="text-gray-400 text-xs">Contact E&amp;J Retreats if this keeps happening.</p>
        </div>
      </div>
    );
  }

  const firstName = cleanerName ? cleanerName.split(' ')[0] : '';

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-blue-700 text-white px-4 py-5 shadow">
        <div className="max-w-lg mx-auto">
          <div className="text-2xl mb-1">🧹</div>
          <h1 className="text-xl font-bold">Cleaner Setup</h1>
          <p className="text-blue-200 text-sm mt-0.5">E&amp;J Retreats Cleaning Network</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 pt-6 pb-16 space-y-5">
        {/* Welcome */}
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-1">
            Welcome{firstName ? `, ${firstName}` : ''}!
          </h2>
          <p className="text-sm text-gray-500">
            To start receiving cleaning jobs and payouts from E&amp;J Retreats, please review and agree to the service agreement below, then connect your bank account through Stripe.
          </p>
        </div>

        {/* What to expect */}
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-3">How it works</h2>
          <ul className="space-y-2">
            {[
              'Jobs are dispatched to you via email and your cleaner portal',
              'Accept the job in your portal to confirm',
              'Complete the cleaning and submit a photo report',
              'Your payout is sent automatically — no invoicing needed',
              'Funds arrive in your bank within 1–2 business days of payout',
            ].map(item => (
              <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Agreement */}
        <div className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-white">
            <h3 className="font-semibold text-gray-800 text-sm">Service Agreement</h3>
          </div>
          <div className="px-4 py-3 max-h-56 overflow-y-auto">
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">
              {CLEANER_AGREEMENT}
            </pre>
          </div>
          <div className="px-4 py-3 border-t border-gray-200 bg-white">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-blue-700 shrink-0"
              />
              <span className="text-sm text-gray-700">
                I have read and agree to the E&amp;J Retreats Cleaner Service Agreement
              </span>
            </label>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleAgreeAndContinue}
          disabled={!agreed}
          className="w-full bg-blue-700 text-white font-bold py-4 rounded-2xl text-base disabled:opacity-40 transition-colors active:bg-blue-800"
        >
          Agree &amp; Set Up Payout Account
        </button>

        <p className="text-xs text-gray-400 text-center">
          You'll be redirected to Stripe to securely connect your bank account. E&amp;J Retreats never stores your banking details.
        </p>
      </div>
    </div>
  );
}
