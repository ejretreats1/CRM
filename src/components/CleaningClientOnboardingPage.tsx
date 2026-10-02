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
  /** Per-property cleaning fee as currently set in the CRM (0 = not set yet) */
  properties?: { id: string; name: string; fee: number }[];
}

type PageState = 'loading' | 'error' | 'form' | 'payment' | 'done';

function CardForm({ token, fees, onSuccess }: { token: string; fees: { name: string; fee: number }[]; onSuccess: () => void }) {
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
          body: JSON.stringify({ flow: 'cleaning-client', action: 'confirm', token, setupIntentId: setupIntent.id, consent: { agreedAt: new Date().toISOString(), feesShown: fees, userAgent: navigator.userAgent } }),
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
        <PaymentElement options={{ layout: { type: 'accordion', defaultCollapsed: false, spacedAccordionItems: true } }} />
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
        setData(d);
        if (d.status === 'completed') { setPageState('done'); return; }
        // Back from a bank authentication (3-D Secure) redirect: finish the confirmation here.
        const qs = new URLSearchParams(window.location.search);
        const returnedIntent = qs.get('setup_intent');
        if (returnedIntent) {
          if (qs.get('redirect_status') === 'succeeded') {
            const rc = await fetch('/api/documents', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ flow: 'cleaning-client', action: 'confirm', token, setupIntentId: returnedIntent, consent: { agreedAt: new Date().toISOString(), feesShown: d.properties ?? [], userAgent: navigator.userAgent } }),
            });
            if (rc.ok) { setPageState('done'); return; }
            const dc = await rc.json().catch(() => ({}));
            setErrorMsg(dc.error ?? 'Your bank approved the card but we could not finish saving it. Please try again.');
          } else {
            setErrorMsg('Card authentication was not completed. Please try again.');
          }
        }
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

  const BrandHeader = ({ subtitle }: { subtitle?: string }) => (
    <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white px-4 py-6 shadow-lg">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-xl font-black text-white shrink-0">
            E&amp;J
          </div>
          <div>
            <div className="text-xs font-semibold tracking-widest text-blue-200 uppercase">E&amp;J Retreats</div>
            <div className="text-base font-bold leading-tight">Cleaning Services</div>
          </div>
        </div>
        {subtitle && (
          <div className="border-t border-white/20 pt-3 mt-1">
            <p className="text-blue-100 text-sm">{subtitle}</p>
          </div>
        )}
      </div>
    </div>
  );

  if (pageState === 'loading') {
    return (
      <div className="h-screen overflow-y-auto bg-gray-50">
        <BrandHeader />
        <div className="flex items-center justify-center p-12">
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="h-screen overflow-y-auto bg-gray-50">
        <BrandHeader />
        <div className="flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center mt-6">
            <div className="text-4xl mb-4">❌</div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Something went wrong</h2>
            <p className="text-gray-500 text-sm">{errorMsg}</p>
          </div>
        </div>
      </div>
    );
  }

  if (pageState === 'done') {
    return (
      <div className="h-screen overflow-y-auto bg-gray-50">
        <BrandHeader />
        <div className="flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center mt-6">
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
      </div>
    );
  }

  const propertySubtitle = data && (data.propertyConfigIds?.length ?? 1) > 1
    ? `${data.propertyConfigIds.length} Properties — ${data.clientName ?? ''}`
    : `${data?.propertyName ?? ''}${data?.clientName ? ' — ' + data.clientName : ''}`;

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <BrandHeader subtitle={propertySubtitle || undefined} />

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

        {/* What will be charged */}
        {data?.properties?.length ? (
          <div className="bg-white rounded-2xl border shadow-sm p-5 mb-5">
            <h2 className="font-semibold text-gray-800 mb-1">Your cleaning fee</h2>
            <p className="text-xs text-gray-500 mb-3">Charged to your card after each completed turnover clean, never before.</p>
            <ul className="divide-y">
              {data.properties.map(p => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-700">{p.name}</span>
                  {p.fee > 0
                    ? <span className="font-semibold text-gray-900">${p.fee.toFixed(2)} / clean</span>
                    : <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Confirmed by E&amp;J before your first clean</span>}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {errorMsg && pageState === 'form' && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-5">{errorMsg}</div>
        )}

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
            <CardForm token={token} fees={(data?.properties ?? []).map(p => ({ name: p.name, fee: p.fee }))} onSuccess={() => setPageState('done')} />
          </Elements>
        )}
      </div>
    </div>
  );
}
