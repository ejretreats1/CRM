import { useState, useEffect } from 'react';

// Public page: a cleaning client fills in everything our cleaners need to know
// about their property. The cleaning fee is intentionally NOT on this form —
// E&J sets it in the CRM after the client submits.

const ICAL_PLATFORMS = ['Airbnb', 'VRBO', 'Booking.com', 'Guesty', 'Hostaway', 'Uplisting', 'Direct', 'Other'];

interface IcalEntry { platform: string; url: string; unitName: string }

interface PropertyForm {
  key: number;
  propertyName: string;
  address: string;
  bedrooms: string;
  bathrooms: string;
  doorCode: string;
  entryInstructions: string;
  checkoutTime: string;
  checkinTime: string;
  icalUrls: IcalEntry[];
  icalPlatform: string;
  icalUrlInput: string;
  icalUnitInput: string;
  laundryOffsite: boolean;
  laundromatAddress: string;
  wifiName: string;
  wifiPassword: string;
  suppliesLocation: string;
  trashInstructions: string;
  notes: string;
}

let nextKey = 1;
function emptyProperty(): PropertyForm {
  return {
    key: nextKey++,
    propertyName: '', address: '', bedrooms: '', bathrooms: '',
    doorCode: '', entryInstructions: '', checkoutTime: '11:00 AM', checkinTime: '4:00 PM',
    icalUrls: [], icalPlatform: 'Airbnb', icalUrlInput: '', icalUnitInput: '',
    laundryOffsite: false, laundromatAddress: '',
    wifiName: '', wifiPassword: '', suppliesLocation: '', trashInstructions: '', notes: '',
  };
}

interface LinkData {
  clientName: string | null;
  clientEmail: string;
  clientPhone: string | null;
  status: string;
}

type PageState = 'loading' | 'error' | 'form' | 'submitting' | 'done';

const inputCls = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';

function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white px-4 py-6 shadow-lg">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-xl font-black text-white shrink-0">
            E&amp;J
          </div>
          <div>
            <div className="text-xs font-semibold tracking-widest text-blue-200 uppercase">E&amp;J Retreats</div>
            <div className="text-base font-bold leading-tight">Cleaning Services — Property Enrollment</div>
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
}

function Shell({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="h-screen overflow-y-auto bg-gray-50 text-gray-900">
      <BrandHeader subtitle={subtitle} />
      {children}
    </div>
  );
}

export default function CleaningPropertyEnrollPage({ token }: { token: string }) {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitError, setSubmitError] = useState('');

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [properties, setProperties] = useState<PropertyForm[]>([emptyProperty()]);
  const [nextLink, setNextLink] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/documents?flow=cleaning-enroll&token=${encodeURIComponent(token)}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) { setErrorMsg(d.error ?? 'Could not load this link.'); setPageState('error'); return; }
        const data = d as LinkData;
        if (data.status === 'submitted') { setPageState('done'); return; }
        setClientName(data.clientName ?? '');
        setClientEmail(data.clientEmail ?? '');
        setClientPhone(data.clientPhone ?? '');
        setPageState('form');
      })
      .catch(() => { setErrorMsg('Failed to load. Please try again.'); setPageState('error'); });
  }, [token]);

  function updateProperty(key: number, patch: Partial<PropertyForm>) {
    setProperties(ps => ps.map(p => (p.key === key ? { ...p, ...patch } : p)));
  }

  function addIcal(p: PropertyForm) {
    const url = p.icalUrlInput.trim();
    if (!url) return;
    updateProperty(p.key, {
      icalUrls: [...p.icalUrls, { platform: p.icalPlatform, url, unitName: p.icalUnitInput.trim() }],
      icalUrlInput: '',
      icalUnitInput: '',
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');

    for (const p of properties) {
      const label = p.propertyName.trim() || 'a property';
      if (!p.propertyName.trim()) { setSubmitError('Please give each property a name.'); return; }
      if (!p.address.trim()) { setSubmitError(`Please enter the address for ${label}.`); return; }
      if (!p.doorCode.trim()) { setSubmitError(`Please enter the door / lock code for ${label}.`); return; }
      if (p.icalUrlInput.trim()) { setSubmitError(`You typed a calendar link for ${label} but didn't click "Add".`); return; }
    }

    setPageState('submitting');
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow: 'cleaning-enroll',
          action: 'submit',
          token,
          client: { name: clientName.trim(), email: clientEmail.trim(), phone: clientPhone.trim() || undefined },
          properties: properties.map(p => ({
            propertyName: p.propertyName.trim(),
            address: p.address.trim(),
            bedrooms: p.bedrooms.trim() || undefined,
            bathrooms: p.bathrooms.trim() || undefined,
            doorCode: p.doorCode.trim(),
            entryInstructions: p.entryInstructions.trim() || undefined,
            checkoutTime: p.checkoutTime.trim() || undefined,
            checkinTime: p.checkinTime.trim() || undefined,
            icalUrls: p.icalUrls.map(u => ({ platform: u.platform, url: u.url, unitName: u.unitName || undefined })),
            laundryOffsite: p.laundryOffsite,
            laundromatAddress: p.laundryOffsite ? (p.laundromatAddress.trim() || undefined) : undefined,
            wifiName: p.wifiName.trim() || undefined,
            wifiPassword: p.wifiPassword.trim() || undefined,
            suppliesLocation: p.suppliesLocation.trim() || undefined,
            trashInstructions: p.trashInstructions.trim() || undefined,
            notes: p.notes.trim() || undefined,
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Submission failed.');
      if (d.nextLink) setNextLink(d.nextLink);
      setPageState('done');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
      setPageState('form');
    }
  }

  if (pageState === 'loading') {
    return (
      <Shell>
        <div className="flex items-center justify-center p-12">
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </Shell>
    );
  }

  if (pageState === 'error') {
    return (
      <Shell>
        <div className="flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center mt-6">
            <div className="text-4xl mb-4">❌</div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Something went wrong</h2>
            <p className="text-gray-500 text-sm">{errorMsg}</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (pageState === 'done') {
    return (
      <Shell>
        <div className="flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center mt-6">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Thank you!</h2>
            <p className="text-gray-500 text-sm">
              We've received your property details.{nextLink ? ' Last step: add a card so cleanings can be billed automatically after each completed clean.' : ' E&J Retreats will review them and follow up with the next step to activate your cleaning service.'}
            </p>
            {nextLink && (
              <a href={nextLink} className="mt-5 block bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-xl text-sm">Add payment method →</a>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  const busy = pageState === 'submitting';

  return (
    <Shell subtitle="Tell us about your property so our cleaners have everything they need.">
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 pt-6 pb-24 space-y-5">

        {/* Client contact */}
        <section className="bg-white rounded-2xl border shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-1">Your contact info</h2>
          <p className="text-xs text-gray-500 mb-4">We'll use this to coordinate cleanings and send you updates.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={labelCls}>Full name *</label>
              <input className={inputCls} value={clientName} onChange={e => setClientName(e.target.value)} required placeholder="Jane Smith" />
            </div>
            <div>
              <label className={labelCls}>Email *</label>
              <input type="email" className={inputCls} value={clientEmail} onChange={e => setClientEmail(e.target.value)} required placeholder="jane@example.com" />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" className={inputCls} value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(555) 123-4567" />
            </div>
          </div>
        </section>

        {/* Properties */}
        {properties.map((p, idx) => (
          <section key={p.key} className="bg-white rounded-2xl border shadow-sm p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">
                🏠 Property {properties.length > 1 ? idx + 1 : ''}
              </h2>
              {properties.length > 1 && (
                <button
                  type="button"
                  onClick={() => setProperties(ps => ps.filter(x => x.key !== p.key))}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>

            {/* Basics */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Property name / nickname *</label>
                <input className={inputCls} value={p.propertyName} onChange={e => updateProperty(p.key, { propertyName: e.target.value })} placeholder="Beach House, Unit 2B, …" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Full address *</label>
                <input className={inputCls} value={p.address} onChange={e => updateProperty(p.key, { address: e.target.value })} placeholder="123 Ocean Drive, Miami FL 33101" />
              </div>
              <div>
                <label className={labelCls}>Bedrooms</label>
                <input className={inputCls} inputMode="numeric" value={p.bedrooms} onChange={e => updateProperty(p.key, { bedrooms: e.target.value })} placeholder="3" />
              </div>
              <div>
                <label className={labelCls}>Bathrooms</label>
                <input className={inputCls} inputMode="decimal" value={p.bathrooms} onChange={e => updateProperty(p.key, { bathrooms: e.target.value })} placeholder="2" />
              </div>
            </div>

            {/* Access */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Access</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Door / lock code *</label>
                  <input className={`${inputCls} font-mono tracking-widest`} value={p.doorCode} onChange={e => updateProperty(p.key, { doorCode: e.target.value })} placeholder="1234#" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Entry &amp; parking instructions</label>
                  <textarea className={`${inputCls} min-h-[72px]`} value={p.entryInstructions} onChange={e => updateProperty(p.key, { entryInstructions: e.target.value })} placeholder="Lockbox is on the left of the front door. Park in spot #12. Gate code 5555." />
                </div>
                <div>
                  <label className={labelCls}>WiFi network</label>
                  <input className={inputCls} value={p.wifiName} onChange={e => updateProperty(p.key, { wifiName: e.target.value })} placeholder="BeachHouse-5G" />
                </div>
                <div>
                  <label className={labelCls}>WiFi password</label>
                  <input className={inputCls} value={p.wifiPassword} onChange={e => updateProperty(p.key, { wifiPassword: e.target.value })} placeholder="optional" />
                </div>
              </div>
            </div>

            {/* Schedule */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Guest schedule</h3>
              <p className="text-xs text-gray-500 mb-3">Cleanings happen between check-out and the next check-in.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Guest check-out time</label>
                  <input className={inputCls} value={p.checkoutTime} onChange={e => updateProperty(p.key, { checkoutTime: e.target.value })} placeholder="11:00 AM" />
                </div>
                <div>
                  <label className={labelCls}>Guest check-in time</label>
                  <input className={inputCls} value={p.checkinTime} onChange={e => updateProperty(p.key, { checkinTime: e.target.value })} placeholder="4:00 PM" />
                </div>
              </div>
            </div>

            {/* Calendar links */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Booking calendar links (iCal)</h3>
              <p className="text-xs text-gray-500 mb-3">
                Paste the calendar export link from each platform you list on (Airbnb: Calendar → Availability → Connect to another website → Export). This lets us schedule cleanings automatically after every checkout. If this property has multiple units, add one link per unit with the unit name.
              </p>
              {p.icalUrls.length > 0 && (
                <ul className="space-y-1.5 mb-2">
                  {p.icalUrls.map((u, i) => (
                    <li key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      <span className="text-[10px] font-bold text-blue-700 w-20 shrink-0">{u.platform}</span>
                      {u.unitName && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">{u.unitName}</span>}
                      <span className="text-[11px] text-gray-500 truncate flex-1 font-mono">{u.url}</span>
                      <button
                        type="button"
                        onClick={() => updateProperty(p.key, { icalUrls: p.icalUrls.filter((_, j) => j !== i) })}
                        className="text-gray-400 hover:text-red-600 text-lg leading-none shrink-0"
                        aria-label="Remove calendar link"
                      >×</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  className={`${inputCls} sm:w-32 shrink-0`}
                  value={p.icalPlatform}
                  onChange={e => updateProperty(p.key, { icalPlatform: e.target.value })}
                >
                  {ICAL_PLATFORMS.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
                <input
                  className={`${inputCls} sm:w-28 shrink-0`}
                  value={p.icalUnitInput}
                  onChange={e => updateProperty(p.key, { icalUnitInput: e.target.value })}
                  placeholder="Unit (optional)"
                />
                <input
                  className={`${inputCls} flex-1`}
                  value={p.icalUrlInput}
                  onChange={e => updateProperty(p.key, { icalUrlInput: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIcal(p); } }}
                  placeholder="https://www.airbnb.com/calendar/ical/…"
                />
                <button
                  type="button"
                  onClick={() => addIcal(p)}
                  disabled={!p.icalUrlInput.trim()}
                  className="px-4 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold rounded-lg hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Laundry, supplies, trash */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Laundry, supplies &amp; trash</h3>
              <div>
                <label className={labelCls}>Where is laundry done?</label>
                <div className="flex gap-2">
                  {[
                    { v: false, label: 'Washer / dryer at the property' },
                    { v: true, label: 'Off-site laundromat' },
                  ].map(opt => (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => updateProperty(p.key, { laundryOffsite: opt.v })}
                      className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                        p.laundryOffsite === opt.v ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-white border-gray-300 text-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {p.laundryOffsite && (
                  <input
                    className={`${inputCls} mt-2`}
                    value={p.laundromatAddress}
                    onChange={e => updateProperty(p.key, { laundromatAddress: e.target.value })}
                    placeholder="Laundromat address"
                  />
                )}
              </div>
              <div>
                <label className={labelCls}>Where are cleaning supplies &amp; spare linens kept?</label>
                <textarea className={`${inputCls} min-h-[60px]`} value={p.suppliesLocation} onChange={e => updateProperty(p.key, { suppliesLocation: e.target.value })} placeholder="Hall closet next to the bathroom. Extra sheets in the owner's closet (code 2468)." />
              </div>
              <div>
                <label className={labelCls}>Trash &amp; recycling instructions</label>
                <textarea className={`${inputCls} min-h-[60px]`} value={p.trashInstructions} onChange={e => updateProperty(p.key, { trashInstructions: e.target.value })} placeholder="Bins are on the side of the house. Pickup is Tuesday — please roll them to the curb." />
              </div>
              <div>
                <label className={labelCls}>Anything else our cleaners should know?</label>
                <textarea className={`${inputCls} min-h-[72px]`} value={p.notes} onChange={e => updateProperty(p.key, { notes: e.target.value })} placeholder="Pool towels go in the blue basket. Please set the thermostat to 74 when leaving. Watch the sliding door — it sticks." />
              </div>
            </div>
          </section>
        ))}

        <button
          type="button"
          onClick={() => setProperties(ps => [...ps, emptyProperty()])}
          className="w-full py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-700 text-sm font-semibold hover:bg-blue-50 transition-colors"
        >
          + Add another property
        </button>

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{submitError}</div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-700 active:bg-blue-800 text-white font-bold py-4 rounded-xl text-base disabled:opacity-50 transition-colors"
        >
          {busy ? 'Submitting…' : `Submit ${properties.length > 1 ? `${properties.length} Properties` : 'Property'}`}
        </button>
        <p className="text-xs text-gray-400 text-center">
          Your door code and WiFi details are only shared with the cleaner assigned to your property.
        </p>
      </form>
    </Shell>
  );
}
