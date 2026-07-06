import { useState, useEffect, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

type PageState = 'loading' | 'error' | 'form' | 'done';

const TODAY = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

function SectionHeading({ num, title }: { num: number; title: string }) {
  return (
    <div className="flex items-start gap-3 mb-2 mt-6 first:mt-0">
      <span className="shrink-0 w-6 h-6 rounded-full bg-blue-700 text-white text-xs font-bold flex items-center justify-center mt-0.5">{num}</span>
      <h3 className="font-bold text-gray-800 text-sm leading-tight">{title}</h3>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="ml-9 mt-1 space-y-1">
      {items.map(item => (
        <li key={item} className="flex items-start gap-2 text-xs text-gray-600">
          <span className="text-blue-500 mt-0.5 shrink-0">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="ml-9 text-xs text-gray-600 leading-relaxed mt-1">{children}</p>;
}

export default function CleanerOnboardingPage({ token }: { token: string }) {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [prefill, setPrefill] = useState<{ cleanerName: string | null; cleanerEmail: string | null }>({ cleanerName: null, cleanerEmail: null });

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [sigEmpty, setSigEmpty] = useState(true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigRef = useRef<any>(null);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/api/documents?flow=cleaner-onboard&token=${encodeURIComponent(token)}`);
        const d = await r.json();
        if (!r.ok) { setErrorMsg(d.error ?? 'Invalid or expired link.'); setPageState('error'); return; }
        if (d.status === 'completed') { setPageState('done'); return; }
        setPrefill({ cleanerName: d.cleanerName, cleanerEmail: d.cleanerEmail });
        setName(d.cleanerName ?? '');
        setEmail(d.cleanerEmail ?? '');
        setPageState('form');
      } catch {
        setErrorMsg('Failed to load. Please try again.');
        setPageState('error');
      }
    }
    load();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { setSubmitError('Name and email are required.'); return; }
    if (!agreed) { setSubmitError('Please read and agree to the agreement.'); return; }
    if (!sigRef.current || sigRef.current.isEmpty()) { setSubmitError('Please draw your signature.'); return; }
    setSubmitting(true);
    setSubmitError('');
    try {
      const signatureDataUrl: string = sigRef.current.toDataURL('image/png');
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow: 'cleaner-onboard',
          action: 'complete',
          token,
          name: name.trim(),
          address: address.trim(),
          phone: phone.trim(),
          email: email.trim(),
          signatureDataUrl,
          signedAt: new Date().toISOString(),
        }),
      });
      const d = await r.json();
      if (!r.ok) { setSubmitError(d.error ?? 'Submission failed.'); return; }
      setPageState('done');
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const BrandHeader = () => (
    <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white px-4 py-5 shadow-lg shrink-0">
      <div className="max-w-2xl mx-auto flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-lg font-black shrink-0">E&amp;J</div>
        <div>
          <div className="text-xs font-semibold tracking-widest text-blue-200 uppercase">E&amp;J Retreats</div>
          <div className="text-base font-bold leading-tight">Contractor Agreement</div>
        </div>
      </div>
    </div>
  );

  if (pageState === 'loading') {
    return (
      <div className="h-screen overflow-y-auto bg-gray-50">
        <BrandHeader />
        <div className="flex items-center justify-center p-12">
          <p className="text-gray-400 text-sm">Loading agreement...</p>
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
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Link not valid</h2>
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
            <h2 className="text-xl font-bold text-gray-800 mb-2">Agreement Signed</h2>
            <p className="text-gray-500 text-sm">
              You're all set, {prefill.cleanerName ?? name}. A copy of the signed agreement has been sent to your email.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <BrandHeader />

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 pt-6 pb-20 space-y-5">

        {/* Intro */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
          <p className="text-sm text-blue-800 leading-relaxed">
            Please review this Independent Contractor Agreement carefully, fill in your information, and sign at the bottom. A copy will be emailed to you after submission.
          </p>
        </div>

        {/* Contractor Info Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Information</p>
          </div>
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Full Legal Name *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Jane Smith"
                className="w-full bg-white text-gray-800 placeholder-gray-400 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email *</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-white text-gray-800 placeholder-gray-400 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                className="w-full bg-white text-gray-800 placeholder-gray-400 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Address</label>
              <input
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="123 Main St, Miami FL 33101"
                className="w-full bg-white text-gray-800 placeholder-gray-400 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
              />
            </div>
          </div>
        </div>

        {/* Agreement Document */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Agreement Document</p>
          </div>

          <div className="px-5 py-6 space-y-1">
            {/* Header */}
            <div className="text-center mb-6">
              <h2 className="text-lg font-bold text-gray-900">E&J Retreats</h2>
              <h3 className="text-base font-semibold text-gray-700 mt-1">Independent Contractor Agreement</h3>
              <p className="text-xs text-gray-400 mt-2">Effective Date: <span className="font-semibold text-gray-600">{TODAY}</span></p>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              This Independent Contractor Agreement ("Agreement") is entered into between <strong>E&J Retreats</strong> ("Company") and the contractor whose name and information are provided above ("Contractor").
            </p>

            {/* Section 1 */}
            <SectionHeading num={1} title="Independent Contractor Relationship" />
            <Para>The Contractor is engaged as an independent contractor and not as an employee of E&J Retreats. Nothing in this Agreement shall be construed to create an employer-employee relationship, partnership, joint venture, or agency relationship.</Para>
            <Para>The Contractor is solely responsible for all taxes, insurance, licensing, permits, and other obligations associated with operating as an independent contractor.</Para>

            {/* Section 2 */}
            <SectionHeading num={2} title="Scope of Services" />
            <Para>The Contractor agrees to perform short-term rental turnover services assigned by E&J Retreats, including but not limited to:</Para>
            <Bullets items={[
              'Cleaning and sanitizing rental properties',
              'Washing, drying, folding, and replacing linens',
              'Making beds',
              'Restocking approved amenities and supplies',
              'Taking completion photos after each cleaning',
              'Reporting damages immediately',
              'Reporting maintenance concerns',
              'Reporting guest belongings left behind',
              'Reporting missing inventory',
              'Reporting low inventory or cleaning supplies',
              'Properly securing the property before departure',
              'Following all company cleaning checklists and procedures',
            ]} />

            {/* Section 3 */}
            <SectionHeading num={3} title="Standards of Performance" />
            <Para>Contractor agrees to:</Para>
            <Bullets items={[
              'Perform services professionally and on time',
              'Follow all E&J Retreats cleaning standards',
              'Complete assigned work thoroughly',
              'Maintain professional appearance and conduct',
              'Treat all guests, owners, and neighbors respectfully',
              'Never smoke, vape, consume alcohol, or use illegal drugs while performing services',
              'Never allow unauthorized persons inside a client\'s property',
            ]} />

            {/* Section 4 */}
            <SectionHeading num={4} title="Payment" />
            <Para>E&J Retreats agrees to pay Contractor within seven (7) calendar days after successful completion of approved work. Payments may be made by ACH, direct deposit, check, or another payment method selected by the Company.</Para>
            <Para>Contractor shall be paid for completed work unless non-payment results directly from Contractor negligence, misconduct, theft, fraud, intentional damage, failure to complete assigned work, or other material breach of this Agreement. The Company may deduct lawful offsets authorized by this Agreement.</Para>

            {/* Section 5 */}
            <SectionHeading num={5} title="Company Property" />
            <Para>All company property remains the sole property of E&J Retreats and includes, but is not limited to: towels, sheets, blankets, pillows, mattress protectors, cleaning supplies, vacuums, mop systems, laundry bags, keys, garage remotes, lockbox keys, uniforms, access devices, and company-purchased inventory.</Para>
            <Para>Upon request or termination of this Agreement, Contractor shall immediately return all Company property. If Company property is not returned, lost due to negligence, or intentionally damaged, E&J Retreats may deduct the reasonable replacement cost from any amounts otherwise owed.</Para>

            {/* Section 6 */}
            <SectionHeading num={6} title="Confidentiality (NDA)" />
            <Para>Contractor acknowledges that they may have access to confidential information, including but not limited to:</Para>
            <Bullets items={[
              'Client names, addresses, door codes, alarm codes, lockbox codes, and Wi-Fi passwords',
              'Pricing, company procedures, vendor information, and reservation information',
              'Financial information, cleaning checklists, and business operations',
            ]} />
            <Para>Contractor agrees that this information is confidential and shall not be disclosed during or after this Agreement without written authorization from E&J Retreats.</Para>

            {/* Section 7 */}
            <SectionHeading num={7} title="Pricing Confidentiality" />
            <Para>Contractor shall not disclose company pricing, contractor compensation, client invoices, profit margins, discounts, contracts, quotes, or rates.</Para>

            {/* Section 8 */}
            <SectionHeading num={8} title="Client Non-Solicitation" />
            <Para>During this Agreement and for twenty-four (24) months following termination, Contractor shall not: solicit Company clients; accept work directly from Company clients; offer competing services to Company clients; refer Company clients to another cleaning company; or attempt to interfere with the Company's relationship with its clients.</Para>

            {/* Section 9 */}
            <SectionHeading num={9} title="Limited Non-Compete" />
            <Para>Nothing in this Agreement prohibits Contractor from operating another cleaning business or working for another company.</Para>
            <Para>However, Contractor agrees not to compete with E&J Retreats by providing services to clients obtained through E&J Retreats during the term of this Agreement or for twenty-four (24) months following termination.</Para>

            {/* Section 10 */}
            <SectionHeading num={10} title="Representation of Company" />
            <Para>While performing services, Contractor shall represent themselves solely as working on behalf of E&J Retreats and shall not hand out personal business cards, advertise competing services, promote their own business, discuss pricing with clients, or accept direct payment from clients.</Para>
            <Para>All requests regarding scheduling, pricing, complaints, or additional services shall be directed to E&J Retreats unless otherwise authorized.</Para>

            {/* Section 11 */}
            <SectionHeading num={11} title="Communication Requirements" />
            <Para>Contractor shall immediately notify E&J Retreats of: property damage, missing inventory, maintenance concerns, guest belongings left behind, safety hazards, broken appliances, supply shortages, guest complaints, and police, fire, or emergency incidents.</Para>

            {/* Section 12 */}
            <SectionHeading num={12} title="Property Access & Security" />
            <Para>Contractor agrees to keep all keys, lockbox codes, garage codes, and alarm codes confidential; never duplicate keys or access devices; never share access credentials; and secure every property before leaving.</Para>

            {/* Section 13 */}
            <SectionHeading num={13} title="Re-Cleans" />
            <Para>If a property requires a return visit because the Contractor failed to meet Company standards, the Contractor may be required to return and correct the deficiencies without additional compensation. If a return visit is not feasible, E&J Retreats may recover the reasonable cost of the re-clean from future amounts owed.</Para>

            {/* Section 14 */}
            <SectionHeading num={14} title="Non-Solicitation of Employees & Contractors" />
            <Para>During this Agreement and for twelve (12) months after termination, Contractor shall not recruit or solicit employees or independent contractors of E&J Retreats for competing work.</Para>

            {/* Section 15 */}
            <SectionHeading num={15} title="Insurance & Liability" />
            <Para>Contractor is responsible for maintaining any insurance required by law or desired for their business operations and agrees to indemnify E&J Retreats for losses arising from the Contractor's negligence or misconduct, to the extent permitted by law.</Para>

            {/* Section 16 */}
            <SectionHeading num={16} title="Media & Photography" />
            <Para>All photographs taken during the performance of services are the exclusive property of E&J Retreats. Contractor shall not use, publish, or share photographs of any property for personal, promotional, or commercial purposes without written authorization.</Para>

            {/* Section 17 */}
            <SectionHeading num={17} title="Guest Privacy" />
            <Para>Contractor shall not photograph, copy, disclose, or retain any guest's personal information, mail, identification, financial documents, or personal belongings except as necessary to document damage or report issues to E&J Retreats.</Para>

            {/* Section 18 */}
            <SectionHeading num={18} title="Termination" />
            <Para>Either party may terminate this Agreement at any time by providing written notice. Contractor shall be paid for all approved work completed prior to termination, subject to lawful deductions authorized by this Agreement.</Para>

            {/* Section 19 */}
            <SectionHeading num={19} title="Governing Law" />
            <Para>This Agreement shall be governed by and construed in accordance with the laws of the State of Florida.</Para>

            {/* Section 20 */}
            <SectionHeading num={20} title="Entire Agreement" />
            <Para>This Agreement constitutes the entire agreement between the parties and supersedes all prior oral or written agreements concerning the subject matter herein. Any amendments must be made in writing and signed by both parties.</Para>

            {/* Divider */}
            <div className="border-t border-gray-200 my-6" />

            {/* Signatures */}
            <h3 className="text-sm font-bold text-gray-800 mb-4">Signatures</h3>

            {/* Company signature */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">E&J Retreats</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-gray-400 mb-1">Representative</p>
                  <p className="font-semibold text-gray-700">E&J Retreats</p>
                </div>
                <div>
                  <p className="text-gray-400 mb-1">Authorized Signature</p>
                  <p className="font-semibold text-gray-700 italic">E&J Retreats LLC</p>
                </div>
                <div>
                  <p className="text-gray-400 mb-1">Date</p>
                  <p className="font-semibold text-gray-700">{TODAY}</p>
                </div>
              </div>
            </div>

            {/* Contractor signature */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">Contractor</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-4">
                <div>
                  <p className="text-gray-400 mb-1">Name</p>
                  <p className="font-semibold text-gray-800">{name || <span className="text-gray-400 italic">Complete your information above</span>}</p>
                </div>
                <div>
                  <p className="text-gray-400 mb-1">Date</p>
                  <p className="font-semibold text-gray-700">{TODAY}</p>
                </div>
              </div>

              {/* Signature pad */}
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium">Draw your signature below:</p>
                <div className="relative bg-white rounded-xl border-2 border-blue-300 overflow-hidden">
                  <SignatureCanvas
                    ref={sigRef}
                    canvasProps={{
                      className: 'w-full',
                      style: { height: '130px', display: 'block' },
                    }}
                    backgroundColor="white"
                    onEnd={() => setSigEmpty(false)}
                  />
                  {sigEmpty && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className="text-gray-300 text-sm select-none">Sign here</p>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { sigRef.current?.clear(); setSigEmpty(true); }}
                  className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
                >
                  Clear signature
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Agreement checkbox */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-blue-700 shrink-0"
            />
            <span className="text-sm text-gray-700 leading-snug">
              I have read and agree to this E&J Retreats Independent Contractor Agreement, including the NDA and non-compete provisions.
            </span>
          </label>
        </div>

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !agreed}
          className="w-full bg-blue-700 active:bg-blue-800 text-white font-bold py-4 rounded-2xl text-base disabled:opacity-50 transition-colors shadow-sm"
        >
          {submitting ? 'Submitting...' : 'Sign & Submit Agreement'}
        </button>

        <p className="text-center text-xs text-gray-400 pb-4">
          A signed copy will be emailed to {email || 'you'} immediately after submission.
        </p>
      </form>
    </div>
  );
}
