import { useState, useEffect } from 'react';
import { CheckCircle2, ChevronRight, ChevronLeft, AlertCircle, Loader2, Copy, Check, Plus, Trash2, Home } from 'lucide-react';

// Fields collected once per property — owners with several properties fill these
// out for each one they add.
interface PropertyEntry {
  propertyAddress: string; propertyType: string; bedrooms: string; bathrooms: string;
  bedSizes: string; doorCodes: string; maxGuests: string;
  platforms: string[]; listingLinks: string; averageRatings: string;
  entryType: string; lockCode: string; wifiName: string; wifiPassword: string;
  amenities: string[]; otherAmenities: string;
  stockedSupplies: string;
  blackoutDates: string; petsAllowed: string; houseRules: string;
  professionalPhotos: string;
}

// Fields collected once for the owner, no matter how many properties they add.
interface FormData {
  fullName: string; email: string; phone: string; monthlyCosts: string;
  properties: PropertyEntry[];
  airbnbLogin: string; vrboLogin: string; bookingLogin: string; stripeLogin: string;
  accountPreference: string; bankInfo: string;
  supplyOrdering: string; preferredCleaner: string; cleanerContact: string;
  preferredHandyman: string; handymanContact: string;
  pricingTool: string; priceLabs: string; pms: string;
  additionalInfo: string; questions: string;
  authorizeOTA: boolean; consentCredentials: boolean;
}

const BLANK_PROPERTY: PropertyEntry = {
  propertyAddress: '', propertyType: '', bedrooms: '', bathrooms: '', bedSizes: '', doorCodes: '', maxGuests: '',
  platforms: [], listingLinks: '', averageRatings: '',
  entryType: '', lockCode: '', wifiName: '', wifiPassword: '',
  amenities: [], otherAmenities: '',
  stockedSupplies: '',
  blackoutDates: '', petsAllowed: '', houseRules: '',
  professionalPhotos: '',
};

const BLANK: FormData = {
  fullName: '', email: '', phone: '', monthlyCosts: '',
  properties: [{ ...BLANK_PROPERTY }],
  airbnbLogin: '', vrboLogin: '', bookingLogin: '', stripeLogin: '',
  accountPreference: '', bankInfo: '',
  supplyOrdering: '', preferredCleaner: '', cleanerContact: '',
  preferredHandyman: '', handymanContact: '',
  pricingTool: '', priceLabs: '', pms: '',
  additionalInfo: '', questions: '', authorizeOTA: false, consentCredentials: false,
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

// Which per-property fields a "Same as Property 1" button copies on each step.
const STEP_COPY_FIELDS: Record<number, (keyof PropertyEntry)[]> = {
  1: ['propertyType', 'bedrooms', 'bathrooms', 'bedSizes', 'doorCodes', 'maxGuests'],
  2: ['platforms', 'listingLinks', 'averageRatings'],
  3: ['entryType', 'lockCode', 'wifiName', 'wifiPassword'],
  4: ['amenities', 'otherAmenities'],
  5: ['stockedSupplies'],
  6: ['blackoutDates', 'petsAllowed', 'houseRules'],
  7: ['professionalPhotos'],
};

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

// Header + wrapper shown above each property's questions. With a single
// property there is nothing to distinguish, so the header is skipped entirely.
function PropertyGroup({
  index, total, label, onCopy, onRemove, children,
}: {
  index: number; total: number; label: string;
  onCopy?: () => void; onRemove?: () => void;
  children: React.ReactNode;
}) {
  if (total === 1) return <div className="space-y-4">{children}</div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#4a90d9] bg-[#0d2040] border border-[#1e3a5a] rounded-lg px-2.5 py-1">
          <Home size={11} /> Property {index + 1}
        </span>
        <span className="text-xs text-[#3a5070] truncate flex-1">{label}</span>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold text-[#b8d4f0] hover:text-white border border-[#1e2d45] hover:border-[#4a90d9] rounded-lg px-2 py-1 transition-colors"
          >
            <Copy size={10} /> Same as #1
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove property ${index + 1}`}
            className="flex-shrink-0 p-1.5 text-[#3a5070] hover:text-[#e05c5c] rounded-lg transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <div className="space-y-4 border-l-2 border-[#1e2d45] pl-3">{children}</div>
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
    fetch(`/api/documents?flow=onboarding&token=${token}`)
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

  function setProp<K extends keyof PropertyEntry>(index: number, key: K, value: PropertyEntry[K]) {
    setForm(prev => ({
      ...prev,
      properties: prev.properties.map((p, i) => (i === index ? { ...p, [key]: value } : p)),
    }));
  }

  function addProperty() {
    setForm(prev => ({ ...prev, properties: [...prev.properties, { ...BLANK_PROPERTY }] }));
  }

  function removeProperty(index: number) {
    setForm(prev => ({
      ...prev,
      properties: prev.properties.length > 1 ? prev.properties.filter((_, i) => i !== index) : prev.properties,
    }));
  }

  // Copy this step's answers from the first property — handy for owners whose
  // units share the same WiFi, amenities, house rules, etc.
  function copyFromFirst(index: number, keys: (keyof PropertyEntry)[]) {
    setForm(prev => {
      const first = prev.properties[0];
      if (!first) return prev;
      return {
        ...prev,
        properties: prev.properties.map((p, i) => {
          if (i !== index) return p;
          const next = { ...p };
          for (const key of keys) {
            const value = first[key];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (next as any)[key] = Array.isArray(value) ? [...value] : value;
          }
          return next;
        }),
      };
    });
  }

  function canProceed(): boolean {
    if (step === 0) return !!(form.fullName.trim() && form.email.trim() && form.phone.trim());
    if (step === 1) {
      return form.properties.length > 0
        && form.properties.every(p => p.propertyAddress.trim() && p.bedSizes.trim());
    }
    if (step === 7) return form.authorizeOTA && form.consentCredentials;
    return true;
  }

  async function handleSubmit() {
    if (!canProceed()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      // Flatten the first property alongside the array so anything still
      // reading the old single-property shape keeps working.
      const payload = {
        ...form,
        ...(form.properties[0] ?? BLANK_PROPERTY),
        propertyCount: form.properties.length,
      };
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'onboarding', action: 'submit', token, formData: payload }),
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

  // Renders a block of per-property questions for every property on the form.
  function eachProperty(
    render: (property: PropertyEntry, index: number) => React.ReactNode,
    { allowRemove = false }: { allowRemove?: boolean } = {},
  ) {
    const copyFields = STEP_COPY_FIELDS[step] ?? [];
    return (
      <div className="space-y-6">
        {form.properties.map((property, i) => (
          <PropertyGroup
            key={i}
            index={i}
            total={form.properties.length}
            label={property.propertyAddress.trim() || 'Address not entered yet'}
            onCopy={i > 0 && copyFields.length ? () => copyFromFirst(i, copyFields) : undefined}
            onRemove={allowRemove && form.properties.length > 1 ? () => removeProperty(i) : undefined}
          >
            {render(property, i)}
          </PropertyGroup>
        ))}
      </div>
    );
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
    const propertyCount = form.properties.length;
    return (
      <div className="min-h-screen bg-[#0a1120] flex items-center justify-center p-6">
        <div className="text-center max-w-sm w-full">
          <img src="/favicon-512.png" alt="E&J Retreats" className="h-16 w-16 mx-auto mb-5 rounded-2xl" />
          <div className="w-16 h-16 rounded-full bg-[#0a2518] flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="text-[#4ab57a]" size={36} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">You're All Set!</h2>
          <p className="text-[#b8d4f0] text-sm leading-relaxed mb-6">
            Thank you for completing your onboarding. Your client profile
            {propertyCount > 1 ? ` and all ${propertyCount} properties have` : ' has'} been created and our team will be in touch shortly.
          </p>

          <div className="space-y-3 text-left">
            {form.properties.some(p => p.professionalPhotos === 'Yes') && (
              <div className="bg-[#101d2e] border border-[#1e3a5a] rounded-2xl p-4">
                <p className="text-xs font-semibold text-[#4a90d9] uppercase tracking-wide mb-1">Action Required</p>
                <p className="text-sm text-[#b8d4f0]">
                  Please email your professional photos to{' '}
                  <a href="mailto:ejretreats1@gmail.com" className="text-[#4a90d9] hover:underline font-medium">ejretreats1@gmail.com</a>
                  {propertyCount > 1 && ' — please label which property each set of photos belongs to.'}
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
          <div className="space-y-6">
            <div className="bg-[#0d2040] border border-[#1e3a5a] rounded-2xl p-4">
              <p className="text-sm font-semibold text-white mb-1">Have more than one property?</p>
              <p className="text-xs text-[#b8d4f0]">
                Add every property you'd like us to manage. The remaining sections will ask about each one — and you can copy
                answers from your first property whenever they're the same.
              </p>
            </div>

            {eachProperty((property, i) => (
              <>
                <SectionCard>
                  <Label required>Property Address</Label>
                  <Input placeholder="123 Main St, City, State 12345" value={property.propertyAddress} onChange={e => setProp(i, 'propertyAddress', e.target.value)} />
                </SectionCard>
                <SectionCard>
                  <Label>Type of Property</Label>
                  <Input placeholder="e.g. Single Family Home, Condo, Duplex, Apartment" value={property.propertyType} onChange={e => setProp(i, 'propertyType', e.target.value)} />
                </SectionCard>
                <div className="grid grid-cols-2 gap-3">
                  <SectionCard>
                    <Label>Bedrooms</Label>
                    <Input type="number" placeholder="3" min="0" value={property.bedrooms} onChange={e => setProp(i, 'bedrooms', e.target.value)} />
                  </SectionCard>
                  <SectionCard>
                    <Label>Bathrooms</Label>
                    <Input type="number" placeholder="2" min="0" step="0.5" value={property.bathrooms} onChange={e => setProp(i, 'bathrooms', e.target.value)} />
                  </SectionCard>
                </div>
                <SectionCard>
                  <Label required>What sized beds are in each room?</Label>
                  <Textarea placeholder={"Bedroom 1: King\nBedroom 2: Queen\nBedroom 3: 2 Twins"} value={property.bedSizes} onChange={e => setProp(i, 'bedSizes', e.target.value)} />
                </SectionCard>
                <SectionCard>
                  <Label>Door Code(s)</Label>
                  <Input placeholder="e.g. Front door: 1234#" value={property.doorCodes} onChange={e => setProp(i, 'doorCodes', e.target.value)} />
                </SectionCard>
                <SectionCard>
                  <Label>Maximum Guest Capacity</Label>
                  <Input type="number" placeholder="6" min="1" value={property.maxGuests} onChange={e => setProp(i, 'maxGuests', e.target.value)} />
                </SectionCard>
              </>
            ), { allowRemove: true })}

            <button
              type="button"
              onClick={addProperty}
              className="w-full flex items-center justify-center gap-2 border border-dashed border-[#2a3a55] hover:border-[#4a90d9] bg-[#0d1623] text-[#b8d4f0] hover:text-white text-sm font-semibold py-3.5 rounded-2xl transition-colors"
            >
              <Plus size={15} /> Add Another Property
            </button>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            {eachProperty((property, i) => (
              <>
                <SectionCard>
                  <Label hint="Check all that apply">Is your property currently listed on any booking platforms?</Label>
                  <div className="mt-1">
                    <Checkboxes options={PLATFORMS} values={property.platforms} onChange={v => setProp(i, 'platforms', v)} />
                  </div>
                </SectionCard>
                <SectionCard>
                  <Label hint="Paste your listing URLs, or type N/A">Links to your current listings</Label>
                  <Textarea placeholder="https://airbnb.com/rooms/..." rows={3} value={property.listingLinks} onChange={e => setProp(i, 'listingLinks', e.target.value)} />
                </SectionCard>
                <SectionCard>
                  <Label hint="Type N/A if not applicable">Average rating out of 5 stars?</Label>
                  <Input placeholder="e.g. 4.85 stars" value={property.averageRatings} onChange={e => setProp(i, 'averageRatings', e.target.value)} />
                </SectionCard>
              </>
            ))}

            {form.properties.length > 1 && (
              <p className="text-xs text-[#3a5070]">
                The logins below cover all of your properties — enter them once.
              </p>
            )}
            <div className="space-y-4">
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
          </div>
        );

      case 3:
        return eachProperty((property, i) => (
          <>
            <SectionCard>
              <Label>Type of Entry</Label>
              <div className="mt-2">
                <Radio
                  options={['Smart Lock', 'Lockbox', 'Key Exchange', 'Door code (non smart lock)']}
                  value={property.entryType}
                  onChange={v => setProp(i, 'entryType', v)}
                />
              </div>
            </SectionCard>
            <SectionCard>
              <Label>Door / Lock Code</Label>
              <Input placeholder="e.g. 4321" value={property.lockCode} onChange={e => setProp(i, 'lockCode', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label>WiFi Network Name</Label>
              <Input placeholder="e.g. HomeNetwork_5G" value={property.wifiName} onChange={e => setProp(i, 'wifiName', e.target.value)} />
            </SectionCard>
            <SectionCard>
              <Label>WiFi Password</Label>
              <Input placeholder="WiFi password" value={property.wifiPassword} onChange={e => setProp(i, 'wifiPassword', e.target.value)} />
            </SectionCard>
          </>
        ));

      case 4:
        return eachProperty((property, i) => (
          <>
            <SectionCard>
              <Label hint="Check all that apply">Does the property have any of the following?</Label>
              <div className="mt-1">
                <Checkboxes options={AMENITIES} values={property.amenities} onChange={v => setProp(i, 'amenities', v)} />
              </div>
            </SectionCard>
            <SectionCard>
              <Label>Any other outstanding amenities we should know about?</Label>
              <Textarea placeholder="e.g. Game room, movie projector, lake access, gym..." value={property.otherAmenities} onChange={e => setProp(i, 'otherAmenities', e.target.value)} />
            </SectionCard>
          </>
        ));

      case 5:
        return (
          <div className="space-y-6">
            {eachProperty((property, i) => (
              <SectionCard>
                <Label>Is the property stocked with linens, towels, and basic supplies?</Label>
                <div className="mt-2">
                  <Radio options={['Yes, fully stocked', 'Partially stocked', 'No, not stocked']} value={property.stockedSupplies} onChange={v => setProp(i, 'stockedSupplies', v)} />
                </div>
              </SectionCard>
            ))}

            <div className="space-y-4">
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
                  <Label hint={form.properties.length > 1 ? 'Note which properties they clean' : 'Or type N/A'}>Cleaner's contact info</Label>
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
          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
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
                <Label>Do you currently use a Property Management Software?</Label>
                <Input placeholder="Type No, or list the PMS name (e.g. Guesty, Hostaway)" value={form.pms} onChange={e => set('pms', e.target.value)} />
              </SectionCard>
            </div>

            {eachProperty((property, i) => (
              <>
                <SectionCard>
                  <Label>Blackout dates or personal use dates we should block?</Label>
                  <Textarea placeholder={"e.g. Dec 20 – Jan 3 (personal)\nEaster weekend"} rows={3} value={property.blackoutDates} onChange={e => setProp(i, 'blackoutDates', e.target.value)} />
                </SectionCard>
                <SectionCard>
                  <Label hint="If yes, we will add a $75 pet fee to all listings">Are pets allowed at your property?</Label>
                  <div className="mt-2">
                    <Radio options={['Yes', 'No']} value={property.petsAllowed} onChange={v => setProp(i, 'petsAllowed', v)} />
                  </div>
                </SectionCard>
                <SectionCard>
                  <Label>Any other house rules we should know about?</Label>
                  <Textarea placeholder={"e.g. No smoking inside\nNo parties or events\nQuiet hours after 10pm"} rows={4} value={property.houseRules} onChange={e => setProp(i, 'houseRules', e.target.value)} />
                </SectionCard>
              </>
            ))}
          </div>
        );

      case 7:
        return (
          <div className="space-y-6">
            {eachProperty((property, i) => (
              <SectionCard>
                <Label>Do you have professional photos already?</Label>
                <div className="mt-2">
                  <Radio options={['Yes', 'No']} value={property.professionalPhotos} onChange={v => setProp(i, 'professionalPhotos', v)} />
                </div>
                {property.professionalPhotos === 'Yes' && (
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
            ))}

            <div className="space-y-4">
              <SectionCard>
                <Label>Is there anything else you want us to know?</Label>
                <Textarea placeholder="Any additional context or information..." value={form.additionalInfo} onChange={e => set('additionalInfo', e.target.value)} />
              </SectionCard>
              <SectionCard>
                <Label>Any specific questions or concerns before we begin?</Label>
                <Textarea placeholder="Ask anything..." value={form.questions} onChange={e => set('questions', e.target.value)} />
              </SectionCard>
            </div>

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

  const showPerPropertyHint = form.properties.length > 1 && step > 0;

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
              Fill out each section to the best of your ability — you can add as many properties as you'd like. Don't hesitate to reach out with any questions.
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
          {showPerPropertyHint && (
            <p className="text-xs text-[#3a5070] mt-2 ml-10">
              Questions under a property tag are answered for each of your {form.properties.length} properties.
            </p>
          )}
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

        {step === 1 && !canProceed() && (
          <p className="text-xs text-[#e05c5c] text-right mt-2">
            Every property needs an address and bed sizes.
          </p>
        )}

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
