import { useState, useEffect } from 'react';
import { CheckCircle2, ChevronRight, ChevronLeft, AlertCircle, Loader2, Copy, Check } from 'lucide-react';

interface FormData {
  fullName: string; email: string; phone: string; monthlyCosts: string;
  propertyAddress: string; propertyType: string; bedrooms: string; bathrooms: string;
  bedSizes: string; doorCodes: string; maxGuests: string;
  platforms: string[]; listingLinks: string; airbnbLogin: string; vrboLogin: string;
  bookingLogin: string; stripeLogin: string; averageRatings: string;
  accountPreference: string; bankInfo: string;
  entryType: string; lockCode: string; wifiName: string; wifiPassword: string;
  amenities: string[]; otherAmenities: string;
  stockedSupplies: string; supplyOrdering: string; preferredCleaner: string;
  cleanerContact: string; preferredHandyman: string; handymanContact: string;
  pricingTool: string; priceLabs: string; blackoutDates: string; pms: string;
  petsAllowed: string; houseRules: string;
  professionalPhotos: string; additionalInfo: string; questions: string;
  authorizeOTA: boolean; consentCredentials: boolean;
}

const BLANK: FormData = {
  fullName: '', email: '', phone: '', monthlyCosts: '',
  propertyAddress: '', propertyType: '', bedrooms: '', bathrooms: '', bedSizes: '', doorCodes: '', maxGuests: '',
  platforms: [], listingLinks: '', airbnbLogin: '', vrboLogin: '', bookingLogin: '', stripeLogin: '',
  averageRatings: '', accountPreference: '', bankInfo: '',
  entryType: '', lockCode: '', wifiName: '', wifiPassword: '',
  amenities: [], otherAmenities: '',
  stockedSupplies: '', supplyOrdering: '', preferredCleaner: '', cleanerContact: '',
  preferredHandyman: '', handymanContact: '',
  pricingTool: '', priceLabs: '', blackoutDates: '', pms: '', petsAllowed: '', houseRules: '',
  professionalPhotos: '', additionalInfo: '', questions: '', authorizeOTA: false, consentCredentials: false,
};

const STEPS = [
  'Owner Information',
  'Property Details',
  'Listing Platforms',
  'Property Access',
  'Features & Amenities',
  'Supplies & Maintenance',
  'Pricing & Preferences',
  'Final Notes & Legal',
];

const PLATFORMS  = ['Airbnb', 'VRBO', 'Booking.com', 'Google', 'Direct Booking Website', 'Not listed on any platform'];
const AMENITIES  = ['Washer/Dryer', 'Dishwasher', 'Air Conditioning', 'Heating', 'Pool', 'Hot Tub', 'Fireplace', 'Balcony/Patio', 'Free Parking'];

// ─── Tiny field components ────────────────────────────────────────────────────

function Label({ children, required, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <div className="mb-2">
      <label className="block text-sm font-medium text-[#cfe0f5]">
        {children} {required && <span className="text-[#e05c5c]">*</span>}
      </label>
      {hint && <p className="text-xs text-[#3a5070] mt-0.5">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-[#0d1623] border border-[#1e2d45] rounded-xl px-4 py-3 text-white text-sm placeholder:text-[#2a3a55] focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent transition-all"
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={(props.rows as number) ?? 4}
      className="w-full bg-[#0d1623] border border-[#1e2d45] rounded-xl px-4 py-3 text-white text-sm placeholder:text-[#2a3a55] focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent transition-all resize-none"
    />
  );
}

function Radio({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
            value === opt
              ? 'border-[#4a90d9] bg-[#0d2040] text-white'
              : 'border-[#1e2d45] bg-[#0d1623] text-[#b8d4f0] hover:border-[#2a3a55]'
          }`}
        >
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${value === opt ? 'border-[#4a90d9]' : 'border-[#3a5070]'}`}>
            {value === opt && <div className="w-2 h-2 rounded-full bg-[#4a90d9]" />}
          </div>
          <span className="text-sm">{opt}</span>
        </button>
      ))}
    </div>
  );
}

function Checkboxes({ options, values, onChange }: { options: string[]; values: string[]; onChange: (v: string[]) => void }) {
  function toggle(opt: string) {
    onChange(values.includes(opt) ? values.filter(v => v !== opt) : [...values, opt]);
  }
  return (
    <div className="space-y-2">
      {options.map(opt => {
        const on = values.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
              on ? 'border-[#4a90d9] bg-[#0d2040]' : 'border-[#1e2d45] bg-[#0d1623] hover:border-[#2a3a55]'
            }`}
          >
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${on ? 'border-[#4a90d9] bg-[#4a90d9]' : 'border-[#3a5070]'}`}>
              {on && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}><path d="M2 6l3 3 5-5" /></svg>}
            </div>
            <span className="text-sm text-white">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#101d2e] border border-[#1e2d45] rounded-2xl p-5">
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OnboardingPage({ token }: { token: string }) {
  type PageStatus = 'loading' | 'active' | 'expired' | 'completed' | 'error';
  const [status, setStatus]     = useState<PageStatus>('loading');
  const [step, setStep]         = useState(0);
  const [form, setForm]         = useState<FormData>(BLANK);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/onboarding?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.status === 'pending')   setStatus('active');
        else if (d.status === 'completed') setStatus('completed');
        else setStatus('expired');
      })
      .catch(() => setStatus('error'));
  }, [token]);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function canProceed(): boolean {
    if (step === 0) return !!(form.fullName.trim() && form.email.trim() && form.phone.trim());
    if (step === 1) return !!(form.propertyAddress.trim() && form.bedSizes.trim());
    if (step === 7) return form.authorizeOTA && form.consentCredentials;
    return true;
  }

  async function handleSubmit() {
    if (!canProceed()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', token, formData: form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Submission failed');
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function copyEmail() {
    navigator.clipboard.writeText('ejretreats1@gmail.com').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Loading ──
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a1120] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#4a90d9]" size={32} />
      </div>
    );
  }

  // ── Expired / Not found ──
  if (status === 'expired' || status === 'error') {
    return (
      <div className="min-h-screen bg-[#0a1120] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <img src="/favicon-512.png" alt="E&J Retreats" className="h-14 w-14 mx-auto mb-5 rounded-2xl" />
          <AlertCircle className="text-[#e05c5c] mx-auto mb-4" size={44} />
          <h2 className="text-xl font-bold text-white mb-2">
            {status === 'expired' ? 'This link has expired' : 'Link not found'}
          </h2>
          <p className="text-[#b8d4f0] text-sm mb-5">
            Please contact E&J Retreats to receive a fresh onboarding link.
          </p>
          <a
            href="mailto:ejretreats1@gmail.com"
            className="inline-block bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            Email Us
          </a>
        </div>
      </div>
    );
  }

  // ── Already completed ──
  if (status === 'completed' && !submitted) {
    return (
      <div className="min-h-screen bg-[#0a1120] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <img src="/favicon-512.png" alt="E&J Retreats" className="h-14 w-14 mx-auto mb-5 rounded-2xl" />
          <CheckCircle2 className="text-[#4ab57a] mx-auto mb-4" size={44} />
          <h2 className="text-xl font-bold text-white mb-2">Already Submitted</h2>
          <p className="text-[#b8d4f0] text-sm">
            This onboarding form has already been completed. Reach out if you have any questions!
          </p>
          <a href="mailto:ejretreats1@gmail.com" className="inline-block mt-4 text-[#4a90d9] text-sm hover:underline">ejretreats1@gmail.com</a>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0a1120] flex items-center justify-center p-6">
        <div className="text-center max-w-sm w-full">
          <img src="/favicon-512.png" alt="E&J Retreats" className="h-16 w-16 mx-auto mb-5 rounded-2xl" />
          <div className="w-16 h-16 rounded-full bg-[#0a2518] flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="text-[#4ab57a]" size={36} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">You're All Set!</h2>
          <p className="text-[#b8d4f0] text-sm leading-relaxed mb-6">
            Thank you for completing your onboarding. Your client profile has been created and our team will be in touch shortly.
          </p>

          <div className="space-y-3 text-left">
            {form.professionalPhotos === 'Yes' && (
              <div className="bg-[#101d2e] border border-[#1e3a5a] rounded-2xl p-4">
                <p className="text-xs font-semibold text-[#4a90d9] uppercase tracking-wide mb-1">Action Required</p>
                <p className="text-sm text-[#b8d4f0]">
                  Please email your professional photos to{' '}
                  <a href="mailto:ejretreats1@gmail.com" className="text-[#4a90d9] hover:underline font-medium">ejretreats1@gmail.com</a>
                </p>
              </div>
            )}
            <div className="bg-[#101d2e] border border-[#1e2d45] rounded-2xl p-4">
              <p className="text-xs font-semibold text-[#3a5070] uppercase tracking-wide mb-1">Next Step</p>
              <p className="text-sm text-[#b8d4f0] mb-2">Schedule your onboarding call with our team:</p>
              <a
                href="https://calendly.com/ejretreats"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#4a90d9] hover:underline"
              >
                Click Here to Schedule <ChevronRight size={14} />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Active form ──
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <SectionCard>
              <Label required>Full Name</Label>
              <Input placeholder="Jane Smith" value={form.fullName} onChange={e => set('fullName', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label required>Email Address</Label>
              <Input type="email" placeholder="jane@example.com" value={form.email} onChange={e => set('email', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label required>Phone Number</Label>
              <Input type="tel" placeholder="(555) 555-5555" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label hint="Mortgage, utilities, lawn care, HOA fees, etc.">What are your monthly costs as a property owner?</Label>
              <Textarea placeholder="e.g. Mortgage: $2,000 / Utilities: $200 / HOA: $150" value={form.monthlyCosts} onChange={e => set('monthlyCosts', e.target.value)} />
            </SectionCard>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <SectionCard>
              <Label required>Property Address</Label>
              <Input placeholder="123 Main St, City, State 12345" value={form.propertyAddress} onChange={e => set('propertyAddress', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label>Type of Property</Label>
              <Input placeholder="e.g. Single Family Home, Condo, Duplex, Apartment" value={form.propertyType} onChange={e => set('propertyType', e.target.value)} />
            </SectionCard>
            <div className="grid grid-cols-2 gap-3">
              <SectionCard>
                <Label>Bedrooms</Label>
                <Input type="number" placeholder="3" min="0" value={form.bedrooms} onChange={e => set('bedrooms', e.target.value)} />
              </SectionCard>
              <SectionCard>
                <Label>Bathrooms</Label>
                <Input type="number" placeholder="2" min="0" step="0.5" value={form.bathrooms} onChange={e => set('bathrooms', e.target.value)} />
              </SectionCard>
            </div>
            <SectionCard>
              <Label required>What sized beds are in each room?</Label>
              <Textarea placeholder={"Bedroom 1: King\nBedroom 2: Queen\nBedroom 3: 2 Twins"} value={form.bedSizes} onChange={e => set('bedSizes', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label>Door Code(s)</Label>
              <Input placeholder="e.g. Front door: 1234#" value={form.doorCodes} onChange={e => set('doorCodes', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label>Maximum Guest Capacity</Label>
              <Input type="number" placeholder="6" min="1" value={form.maxGuests} onChange={e => set('maxGuests', e.target.value)} />
            </SectionCard>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <SectionCard>
              <Label hint="Check all that apply">Is your property currently listed on any booking platforms?</Label>
              <div className="mt-1">
                <Checkboxes options={PLATFORMS} values={form.platforms} onChange={v => set('platforms', v)} />
              </div>
            </SectionCard>
            <SectionCard>
              <Label hint="Paste your listing URLs, or type N/A">Links to your current listings</Label>
              <Textarea placeholder="https://airbnb.com/rooms/..." rows={3} value={form.listingLinks} onChange={e => set('listingLinks', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label hint="Usually just your phone number — Airbnb will send a verification code">Airbnb Login</Label>
              <Input placeholder="Phone number or email" value={form.airbnbLogin} onChange={e => set('airbnbLogin', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label>VRBO Email & Password</Label>
              <Input placeholder="email / password" value={form.vrboLogin} onChange={e => set('vrboLogin', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label hint={'No account yet? Type "No account" and we\'ll email you setup instructions'}>Booking.com Email & Password</Label>
              <Input placeholder="email / password" value={form.bookingLogin} onChange={e => set('bookingLogin', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label hint="No account yet? Create one and share the login with us">Stripe Email & Password</Label>
              <Input placeholder="email / password" value={form.stripeLogin} onChange={e => set('stripeLogin', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label hint="Type N/A if not applicable">Average rating out of 5 stars?</Label>
              <Input placeholder="e.g. 4.85 stars" value={form.averageRatings} onChange={e => set('averageRatings', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label>Keep listings on your accounts or use our company accounts?</Label>
              <div className="mt-2">
                <Radio
                  options={['Keep listings on my accounts', 'Use company accounts']}
                  value={form.accountPreference}
                  onChange={v => set('accountPreference', v)}
                />
              </div>
            </SectionCard>
            {form.accountPreference === 'Use company accounts' && (
              <SectionCard>
                <Label hint="So we can deposit your Airbnb, VRBO, Booking.com earnings directly to you">Bank Account Info for Deposits</Label>
                <Textarea placeholder={"Routing #:\nAccount #:"} rows={3} value={form.bankInfo} onChange={e => set('bankInfo', e.target.value)} />
              </SectionCard>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <SectionCard>
              <Label>Type of Entry</Label>
              <div className="mt-2">
                <Radio
                  options={['Smart Lock', 'Lockbox', 'Key Exchange', 'Door code (non smart lock)']}
                  value={form.entryType}
                  onChange={v => set('entryType', v)}
                />
              </div>
            </SectionCard>
            <SectionCard>
              <Label>Door / Lock Code</Label>
              <Input placeholder="e.g. 4321" value={form.lockCode} onChange={e => set('lockCode', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label>WiFi Network Name</Label>
              <Input placeholder="e.g. HomeNetwork_5G" value={form.wifiName} onChange={e => set('wifiName', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label>WiFi Password</Label>
              <Input placeholder="WiFi password" value={form.wifiPassword} onChange={e => set('wifiPassword', e.target.value)} />
            </SectionCard>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <SectionCard>
              <Label hint="Check all that apply">Does the property have any of the following?</Label>
              <div className="mt-1">
                <Checkboxes options={AMENITIES} values={form.amenities} onChange={v => set('amenities', v)} />
              </div>
            </SectionCard>
            <SectionCard>
              <Label>Any other outstanding amenities we should know about?</Label>
              <Textarea placeholder="e.g. Game room, movie projector, lake access, gym..." value={form.otherAmenities} onChange={e => set('otherAmenities', e.target.value)} />
            </SectionCard>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <SectionCard>
              <Label>Is the property stocked with linens, towels, and basic supplies?</Label>
              <div className="mt-2">
                <Radio options={['Yes, fully stocked', 'Partially stocked', 'No, not stocked']} value={form.stockedSupplies} onChange={v => set('stockedSupplies', v)} />
              </div>
            </SectionCard>
            <SectionCard>
              <Label hint="This is an extra add-on we can discuss — we'll handle ordering & restocking everything for you">Do you want us to handle supply ordering & restocking?</Label>
              <div className="mt-2">
                <Radio options={['Yes', 'No']} value={form.supplyOrdering} onChange={v => set('supplyOrdering', v)} />
              </div>
            </SectionCard>
            <SectionCard>
              <Label hint="We prefer to hand-pick cleaners ourselves for quality control">Do you have a preferred cleaner you'd like to keep?</Label>
              <div className="mt-2">
                <Radio options={['Yes', 'No']} value={form.preferredCleaner} onChange={v => set('preferredCleaner', v)} />
              </div>
            </SectionCard>
            {form.preferredCleaner === 'Yes' && (
              <SectionCard>
                <Label hint="Or type N/A">Cleaner's contact info</Label>
                <Textarea placeholder={"Name:\nPhone:\nEmail:"} rows={3} value={form.cleanerContact} onChange={e => set('cleanerContact', e.target.value)} />
              </SectionCard>
            )}
            <SectionCard>
              <Label>Do you have a preferred handyman or maintenance contact?</Label>
              <div className="mt-2">
                <Radio options={['Yes', 'No']} value={form.preferredHandyman} onChange={v => set('preferredHandyman', v)} />
              </div>
            </SectionCard>
            {form.preferredHandyman === 'Yes' && (
              <SectionCard>
                <Label hint="Or type N/A">Handyman / maintenance contact info</Label>
                <Input placeholder="Name, phone, email..." value={form.handymanContact} onChange={e => set('handymanContact', e.target.value)} />
              </SectionCard>
            )}
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <SectionCard>
              <Label>Do you currently have a dynamic pricing tool such as PriceLabs?</Label>
              <Input className="mt-1" placeholder="Yes / No / Name of tool" value={form.pricingTool} onChange={e => set('pricingTool', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label hint="Dynamic pricing with seasonality & demand can significantly increase revenue">Would you pay $25/month for PriceLabs software?</Label>
              <div className="mt-2">
                <Radio
                  options={['Yes, that sounds awesome!', 'I already have PriceLabs', 'No, I want to miss out on tons of revenue']}
                  value={form.priceLabs}
                  onChange={v => set('priceLabs', v)}
                />
              </div>
            </SectionCard>
            <SectionCard>
              <Label>Blackout dates or personal use dates we should block?</Label>
              <Textarea placeholder={"e.g. Dec 20 – Jan 3 (personal)\nEaster weekend"} rows={3} value={form.blackoutDates} onChange={e => set('blackoutDates', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label>Do you currently use a Property Management Software?</Label>
              <Input placeholder="Type No, or list the PMS name (e.g. Guesty, Hostaway)" value={form.pms} onChange={e => set('pms', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label hint="If yes, we will add a $75 pet fee to all listings">Are pets allowed at your property?</Label>
              <div className="mt-2">
                <Radio options={['Yes', 'No']} value={form.petsAllowed} onChange={v => set('petsAllowed', v)} />
              </div>
            </SectionCard>
            <SectionCard>
              <Label>Any other house rules we should know about?</Label>
              <Textarea placeholder={"e.g. No smoking inside\nNo parties or events\nQuiet hours after 10pm"} rows={4} value={form.houseRules} onChange={e => set('houseRules', e.target.value)} />
            </SectionCard>
          </div>
        );

      case 7:
        return (
          <div className="space-y-4">
            <SectionCard>
              <Label>Do you have professional photos already?</Label>
              <div className="mt-2">
                <Radio options={['Yes', 'No']} value={form.professionalPhotos} onChange={v => set('professionalPhotos', v)} />
              </div>
              {form.professionalPhotos === 'Yes' && (
                <div className="mt-3 bg-[#0d2040] border border-[#1e3a5a] rounded-xl p-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-[#b8d4f0]">
                    Please email photos to <span className="font-medium text-white">ejretreats1@gmail.com</span>
                  </p>
                  <button onClick={copyEmail} className="text-[#4a90d9] flex-shrink-0">
                    {copied ? <Check size={14} className="text-[#4ab57a]" /> : <Copy size={14} />}
                  </button>
                </div>
              )}
            </SectionCard>
            <SectionCard>
              <Label>Is there anything else you want us to know?</Label>
              <Textarea placeholder="Any additional context or information..." value={form.additionalInfo} onChange={e => set('additionalInfo', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label>Any specific questions or concerns before we begin?</Label>
              <Textarea placeholder="Ask anything..." value={form.questions} onChange={e => set('questions', e.target.value)} />
            </SectionCard>

            {/* Schedule call */}
            <div className="bg-[#0d2040] border border-[#1e3a5a] rounded-2xl p-4">
              <p className="text-sm font-semibold text-white mb-1">Schedule Your Onboarding Call</p>
              <p className="text-xs text-[#b8d4f0] mb-3">After scheduling, please come back and finish submitting this form.</p>
              <a
                href="https://calendly.com/ejretreats"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#4a90d9] hover:underline"
              >
                Click Here to Schedule <ChevronRight size={14} />
              </a>
            </div>

            {/* Legal */}
            <div className="bg-[#101d2e] border border-[#1e2d45] rounded-2xl p-5">
              <p className="text-sm font-semibold text-white mb-1">Legal & Authorization</p>
              <p className="text-xs text-[#3a5070] mb-4">
                Please check both boxes below. You will receive an email to sign our management agreement shortly if you have not already.
              </p>
              <div className="space-y-3">
                {[
                  { key: 'authorizeOTA' as const, label: 'I authorize access to OTA accounts and listing management' },
                  { key: 'consentCredentials' as const, label: 'I consent to storing credentials and accessing accounts as needed' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set(key, !form[key])}
                    className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                      form[key] ? 'border-[#4a90d9] bg-[#0d2040]' : 'border-[#1e2d45] bg-[#0d1623] hover:border-[#2a3a55]'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${form[key] ? 'border-[#4a90d9] bg-[#4a90d9]' : 'border-[#3a5070]'}`}>
                      {form[key] && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}><path d="M2 6l3 3 5-5" /></svg>}
                    </div>
                    <span className="text-sm text-white">{label}</span>
                  </button>
                ))}
              </div>
              {(!form.authorizeOTA || !form.consentCredentials) && (
                <p className="text-xs text-[#e05c5c] mt-3">Both boxes must be checked to submit.</p>
              )}
            </div>

            {submitError && (
              <div className="bg-[#2a0e0e] border border-[#5a1a1a] text-[#e05c5c] px-4 py-3 rounded-xl text-sm">
                {submitError}
              </div>
            )}
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a1120] pb-16">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-[#0a1120]/95 backdrop-blur-sm border-b border-[#1e2d45]">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <img src="/favicon-512.png" alt="E&J Retreats" className="h-7 w-7 rounded-lg" />
              <span className="font-bold text-white text-sm">E&J Retreats</span>
            </div>
            <span className="text-xs text-[#3a5070]">{step + 1} / {STEPS.length}</span>
          </div>
          <div className="w-full bg-[#1e2d45] rounded-full h-1">
            <div
              className="bg-gradient-to-r from-[#4a90d9] to-[#4ab57a] h-1 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 pt-6">

        {/* Welcome banner on step 0 */}
        {step === 0 && (
          <div className="text-center mb-8">
            <img src="/favicon-512.png" alt="E&J Retreats" className="h-20 w-20 mx-auto mb-5 rounded-2xl shadow-lg shadow-black/40" />
            <h1 className="text-2xl font-bold text-white mb-2">Onboarding Form</h1>
            <p className="text-[#b8d4f0] text-sm leading-relaxed">
              We're so excited to be working together and cannot wait to get rolling!
            </p>
            <p className="text-[#3a5070] text-xs mt-1">
              Fill out each section to the best of your ability. Don't hesitate to reach out with any questions.
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <span className="text-xs text-[#e05c5c]">*</span>
              <span className="text-xs text-[#3a5070]">Indicates required field</span>
            </div>
          </div>
        )}

        {/* Step title */}
        <div className="mb-5">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[#4a90d9] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">{step + 1}</span>
            </div>
            <h2 className="text-base font-bold text-white">{STEPS[step]}</h2>
          </div>
        </div>

        {/* Step content */}
        {renderStep()}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-[#1e2d45]">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-1.5 text-sm text-[#3a5070] hover:text-[#b8d4f0] disabled:invisible transition-colors px-3 py-2 rounded-xl"
          >
            <ChevronLeft size={16} /> Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => { if (canProceed()) setStep(s => s + 1); }}
              disabled={!canProceed()}
              className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              Continue <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || submitting}
              className="flex items-center gap-2 bg-[#4ab57a] hover:bg-[#3aa56a] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {submitting
                ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
                : <>Submit Form <CheckCircle2 size={15} /></>
              }
            </button>
          )}
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 mt-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-[#4a90d9]' : i < step ? 'w-2 bg-[#4ab57a]' : 'w-2 bg-[#1e2d45]'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
