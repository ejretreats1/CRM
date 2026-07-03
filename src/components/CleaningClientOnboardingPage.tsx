import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '');

const SERVICE_AGREEMENT = `E&J Retreats Cleaning Service Agreement

By adding a payment method, you agree to the following terms:

1. SERVICES — E&J Retreats will arrange professional cleaning of your property after each guest checkout as scheduled through our system.

2. FEES — You will be charged the agreed cleaning fee on each guest checkout date. The fee was communicated at enrollment and may be updated with 7 days written notice.

3. PAYMENT — Your card on file is charged automatically at approximately 12:00 PM ET on the day of each guest checkout. A photo report is submitted by the cleaner after each job and reviewed by E&J Retreats.

4. QUALITY — If you are unsatisfied with a cleaning, contact us within 24 hours and we will arrange a free re-clean or credit.

5. CANCELLATION — Either party may cancel this agreement with 14 days written notice. No cancellation fees apply.

6. DAMAGE — Cleaner-caused damage will be reported immediately and covered. Guest-caused damage is subject to Airbnb/VRBO host guarantees and is not covered by this agreement.`;

interface OnboardingData {
  propertyConfigId: string;
  propertyConfigIds: string[];
  propertyName: string;
  clientName: string | null;
  clientEmail: string | null;
  status: string;
}

type PageState = 'loading' | 'error' | 'form' | 'payment' | 'done';

function CardForm({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cardError, setCardError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !agreed) return;
    setSubmitting(true);
    setCardError('');
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: window.location.href },
      });
      if (error) {
        setCardError(error.message ?? 'Card setup failed.');
        return;
      }
      if (setupIntent?.status === 'succeeded') {
        const r = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flow: 'cleaning-client', action: 'confirm', token, setupIntentId: setupIntent.id }),
        });
        const d = await r.json();
        if (!r.ok) { setCardError(d.error ?? 'Confirmation failed.'); return; }
        onSuccess();
      } else {
        setCardError('Card setup did not complete. Please try again.');
      }
    } catch (e: unknown) {
      setCardError(e instanceof Error ? e.message : 'Unexpected error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Agreement */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <h3 className="font-semibold text-gray-800 text-sm">Service Agreement</h3>
        </div>
        <div className="px-4 py-3 max-h-48 overflow-y-auto">
          <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">{SERVICE_AGREEMENT}</pre>
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
              I have read and agree to the E&J Retreats Cleaning Service Agreement
            </span>
          </label>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-800 text-sm mb-3">Payment Method</h3>
        <PaymentElement options={{ layout: { type: 'accordion', defaultCollapsed: false, radios: false, spacedAccordionItems: true } }} />
        <p className="text-xs text-gray-400 mt-2">Your card will not be charged today. You are only charged after each completed cleaning.</p>
      </div>

      {cardError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          {cardError}
        </div>
      )}

      <button
        type="submit"
        disabled={!agreed || !stripe || submitting}
        className="w-full bg-blue-700 active:bg-blue-800 text-white font-bold py-4 rounded-xl text-base disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Setting up...' : 'Confirm & Save Card'}
      </button>
    </form>
  );
}

export default function CleaningClientOnboardingPage({ token }: { token: string }) {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [data, setData] = useState<OnboardingData | null>(null);
  const [clientSecret, setClientSecret] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/api/documents?flow=cleaning-client&token=${encodeURIComponent(token)}`);
        const d = await r.json();
        if (!r.ok) { setErrorMsg(d.error ?? 'Could not load onboarding link.'); setPageState('error'); return; }
        if (d.status === 'completed') { setPageState('done'); return; }
        setData(d);
        // Fetch setup intent
        const r2 = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flow: 'cleaning-client', action: 'setup-intent', token }),
        });
        const d2 = await r2.json();
        if (!r2.ok) { setErrorMsg(d2.error ?? 'Could not initialize payment setup.'); setPageState('error'); return; }
        setClientSecret(d2.clientSecret);
        setPageState('form');
      } catch {
        setErrorMsg('Failed to load. Please try again.');
        setPageState('error');
      }
    }
    load();
  }, [token]);

  if (pageState === 'loading') {
    return (
      <div className="h-screen overflow-y-auto bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="h-screen overflow-y-auto bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Something went wrong</h2>
          <p className="text-gray-500 text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (pageState === 'done') {
    return (
      <div className="h-screen overflow-y-auto bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">You're all set!</h2>
          <p className="text-gray-500 text-sm">
            {data && (data.propertyConfigIds?.length ?? 1) > 1
              ? <>Your cleaning service for <strong>{data.propertyConfigIds.length} properties</strong> is active.</>
              : <>Your cleaning service for <strong>{data?.propertyName ?? 'your property'}</strong> is active.</>
            }{' '}
            Your card is on file and will only be charged after each completed cleaning.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="bg-blue-700 text-white px-4 py-5 shadow">
        <div className="max-w-lg mx-auto">
          <div className="text-2xl mb-1">🏠</div>
          <h1 className="text-xl font-bold">Cleaning Service Setup</h1>
          <p className="text-blue-200 text-sm mt-0.5">
            {data && (data.propertyConfigIds?.length ?? 1) > 1
              ? `${data.propertyConfigIds.length} Properties`
              : data?.propertyName}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 pt-6 pb-16">
        {/* Properties (batch) */}
        {data && (data.propertyConfigIds?.length ?? 1) > 1 && (
          <div className="bg-white rounded-2xl border shadow-sm p-5 mb-5">
            <h2 className="font-semibold text-gray-800 mb-3">Properties</h2>
            <ul className="space-y-1">
              {data.propertyName.split(', ').map(name => (
                <li key={name} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-blue-600">🏠</span> {name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* What's included */}
        <div className="bg-white rounded-2xl border shadow-sm p-5 mb-5">
          <h2 className="font-semibold text-gray-800 mb-3">What's included</h2>
          <ul className="space-y-2">
            {[
              'Professional cleaning after every guest checkout',
              'Cleaning checklist completed by the cleaner',
              'Photo report submitted after every job',
              'Damage notes reported immediately',
              'Automatic billing — only after completed cleans',
            ].map(item => (
              <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-green-500 mt-0.5">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {clientSecret && stripePromise && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: 'stripe',
                variables: { colorPrimary: '#1e40af', borderRadius: '8px' },
              },
            }}
          >
            <CardForm token={token} onSuccess={() => setPageState('done')} />
          </Elements>
        )}
      </div>
    </div>
  );
}
