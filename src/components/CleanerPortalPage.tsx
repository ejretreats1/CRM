import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { acceptCleaningJob, submitCleaningJob } from '../services/cleaningApi';

const CHECKLIST_ITEMS = [
  'All surfaces dusted',
  'Floors vacuumed',
  'Floors mopped',
  'Bathrooms cleaned and sanitized',
  'Kitchen counters and sink cleaned',
  'Stovetop and oven wiped',
  'Microwave cleaned inside and out',
  'Dishes washed and put away',
  'Trash emptied and bins relined',
  'Linens changed and beds made',
  'Towels replaced with fresh ones',
  'Windows and mirrors wiped',
  'Patio or outdoor area tidied',
  'All lights and fans checked',
];

interface JobData {
  id: string;
  propertyName: string;
  checkoutDate: string;
  checkinDate?: string;
  guestName?: string;
  notes?: string;
  status: string;
  assignedCleanerId?: string;
  portalData?: { submittedAt: string };
  doorCode?: string | null;
  address?: string | null;
  checkoutTime?: string | null;
  checkinTime?: string | null;
  photoUrl?: string | null;
  stagingPhotoUrls?: string[];
  laundromatAddress?: string | null;
}

interface CleanerData {
  cleanerId: string;
  cleanerName: string;
  cleanerEmail: string;
  payout: number;
}

type PageState = 'loading' | 'error' | 'claimed' | 'accept' | 'passed' | 'portal' | 'submitted';

export default function CleanerPortalPage({ combined }: { combined: string }) {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [job, setJob] = useState<JobData | null>(null);
  const [cleaner, setCleaner] = useState<CleanerData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [passing, setPassing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [canAccept, setCanAccept] = useState(true);

  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    () => Object.fromEntries(CHECKLIST_ITEMS.map(item => [item, false]))
  );
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [damageNotes, setDamageNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const colonIdx = combined.indexOf(':');
  const jobId = combined.slice(0, colonIdx);
  const token = combined.slice(colonIdx + 1);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/api/documents?flow=cleaning&token=${encodeURIComponent(combined)}`);
        const d = await r.json();
        if (!r.ok) {
          setErrorMsg(d.error ?? 'Could not load job.');
          setPageState('error');
          return;
        }
        const { job: j, cleaner: c, canAccept: ca } = d as { job: JobData; cleaner: CleanerData; canAccept: boolean };
        setJob(j);
        setCleaner(c);
        setCanAccept(ca ?? true);

        if (j.status === 'completed' || j.portalData) {
          setPageState(j.assignedCleanerId === c.cleanerId ? 'submitted' : 'claimed');
        } else if (j.status === 'accepted' || j.status === 'in_progress') {
          setPageState(j.assignedCleanerId === c.cleanerId ? 'portal' : 'claimed');
        } else if (j.status === 'cancelled') {
          setErrorMsg('This job has been cancelled.');
          setPageState('error');
        } else {
          setPageState('accept');
        }
      } catch {
        setErrorMsg('Failed to load job. Please try again.');
        setPageState('error');
      }
    }
    load();
  }, [combined]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await acceptCleaningJob(jobId, token);
      setPageState('portal');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to accept.';
      if (msg.includes('already claimed')) {
        setErrorMsg('Sorry — this job was already claimed by another cleaner.');
        setPageState('claimed');
      } else {
        setErrorMsg(msg);
        setPageState('error');
      }
    } finally {
      setAccepting(false);
    }
  };

  const handlePass = async () => {
    if (!confirm('Pass on this job? The next cleaner will be contacted.')) return;
    setPassing(true);
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'cleaning', action: 'decline', combined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed to pass.');
      setPageState('passed');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to pass. Please try again.');
    } finally {
      setPassing(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadingPhoto(true);
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${jobId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('cleaning-photos').upload(path, file, { upsert: true });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('cleaning-photos').getPublicUrl(path);
        setPhotos(prev => [...prev, publicUrl]);
      }
    } catch (e: unknown) {
      alert('Photo upload failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    const doneCount = Object.values(checklist).filter(Boolean).length;
    if (doneCount < Math.ceil(CHECKLIST_ITEMS.length * 0.5)) {
      if (!confirm('Fewer than half the checklist items are checked. Submit anyway?')) return;
    }
    setSubmitting(true);
    try {
      await submitCleaningJob(jobId, token, { checklist, photos, damageNotes: damageNotes.trim() || undefined });
      setPageState('submitted');
    } catch (e: unknown) {
      alert('Submit failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  const dateLabel = job?.checkoutDate
    ? new Date(job.checkoutDate + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      })
    : '';

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading your job...</p>
      </div>
    );
  }

  if (pageState === 'error' || pageState === 'claimed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">{pageState === 'claimed' ? '⚠️' : '❌'}</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            {pageState === 'claimed' ? 'Job Already Claimed' : 'Something went wrong'}
          </h2>
          <p className="text-gray-500 text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (pageState === 'submitted') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Job Submitted!</h2>
          <p className="text-gray-500 text-sm mb-4">
            Great work on <strong>{job?.propertyName}</strong>. Your report has been sent.
          </p>
          {cleaner?.payout ? (
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-green-700 font-bold text-lg">${cleaner.payout} payout</p>
              <p className="text-green-600 text-xs mt-1">Will be processed after review</p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (pageState === 'passed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">👋</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Job Passed</h2>
          <p className="text-gray-500 text-sm">
            No problem — we'll reach out to the next cleaner on the list for <strong>{job?.propertyName}</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (pageState === 'accept') {
    const isSameDay = job?.checkinDate && job.checkinDate === job.checkoutDate;
    const checkinLabel = job?.checkinDate
      ? new Date(job.checkinDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
      : '';
    return (
      <div className="min-h-screen bg-blue-950 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
          <div className="bg-blue-700 px-6 py-5 text-white">
            <div className="text-2xl mb-1">🧹</div>
            <h1 className="text-xl font-bold">Cleaning Job Available</h1>
            <p className="text-blue-200 text-sm mt-1">Hi {cleaner?.cleanerName}!</p>
          </div>
          <div className="p-6 space-y-4">
            {isSameDay && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                <span className="text-lg leading-none">⚡</span>
                <div>
                  <p className="text-red-700 font-bold text-sm">Same-Day Check-In</p>
                  <p className="text-red-600 text-xs mt-0.5">New guests arrive today — please prioritize this clean.</p>
                </div>
              </div>
            )}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
              <Row label="Property" value={job?.propertyName} />
              {job?.address && <Row label="Address" value={job.address} />}
              <Row label="Cleaning Date" value={dateLabel} />
              {job?.checkoutTime && <Row label="Guest Check-out" value={job.checkoutTime} />}
              {job?.checkinDate && (
                <Row
                  label={isSameDay ? '⚡ Next Check-in' : 'Next Check-in'}
                  value={isSameDay ? `Today · ${job.checkinTime ?? checkinLabel}` : `${checkinLabel}${job.checkinTime ? ` · ${job.checkinTime}` : ''}`}
                />
              )}
              {job?.guestName && <Row label="Departing Guest" value={job.guestName} />}
              {cleaner?.payout ? (
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-500 text-sm">Your Payout</span>
                  <span className="text-green-600 font-bold text-xl">${cleaner.payout}</span>
                </div>
              ) : null}
            </div>
            {job?.doorCode && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-blue-500 text-xs font-semibold uppercase tracking-wide mb-1">Door Code</p>
                <p className="text-blue-900 font-bold text-2xl tracking-widest">{job.doorCode}</p>
              </div>
            )}
            {job?.laundromatAddress ? (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">🧺</span>
                  <p className="text-indigo-800 font-bold text-sm">Off-site Laundry Required</p>
                </div>
                <p className="text-indigo-700 text-xs ml-6">Take all linens to the laundromat after cleaning.</p>
                <p className="text-indigo-900 font-semibold text-xs ml-6 mt-1">{job.laundromatAddress}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-1">
                <span className="text-sm">🧺</span>
                <p className="text-gray-400 text-xs">Laundry done at the property</p>
              </div>
            )}
            {job?.notes && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800">
                <strong>Notes:</strong> {job.notes}
              </div>
            )}
            {!canAccept ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                <p className="text-gray-500 text-sm font-medium">You've already passed on this job.</p>
                <p className="text-gray-400 text-xs mt-1">Another cleaner has been contacted.</p>
              </div>
            ) : (
              <>
                <button
                  onClick={handleAccept}
                  disabled={accepting || passing}
                  className="w-full bg-blue-700 active:bg-blue-800 text-white font-bold py-4 rounded-xl text-base disabled:opacity-60 transition-colors"
                >
                  {accepting ? 'Accepting...' : 'Accept This Job'}
                </button>
                <button
                  onClick={handlePass}
                  disabled={accepting || passing}
                  className="w-full bg-white border border-gray-300 text-gray-500 font-semibold py-3 rounded-xl text-sm disabled:opacity-60 transition-colors active:bg-gray-50"
                >
                  {passing ? 'Passing...' : 'Pass'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // portal state
  const checklistDone = Object.values(checklist).filter(Boolean).length;
  const isSameDayPortal = job?.checkinDate && job.checkinDate === job.checkoutDate;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="bg-blue-700 text-white px-4 py-4 shrink-0 shadow z-10">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <span className="text-xl">🧹</span>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base leading-tight truncate">{job?.propertyName}</h1>
            <p className="text-blue-200 text-xs">{dateLabel}</p>
          </div>
          {cleaner?.payout ? (
            <div className="text-right shrink-0">
              <p className="text-green-300 font-bold">${cleaner.payout}</p>
              <p className="text-blue-300 text-xs">payout</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto p-4 space-y-5 pb-4">
        {/* Instructions banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3.5 flex items-start gap-3">
          <span className="text-lg leading-none mt-0.5">📋</span>
          <div>
            <p className="text-blue-800 font-semibold text-sm">How to Submit Your Cleaning Report</p>
            <p className="text-blue-600 text-xs mt-1 leading-relaxed">
              On the day of your clean, go through the checklist below, upload photos of each room, and tap <strong>Submit Report</strong> when you're done.
            </p>
            <p className="text-blue-600 text-xs mt-1 leading-relaxed">
              <strong>Can't make it?</strong> Please tap <strong>Pass</strong> as soon as possible so we can contact the backup cleaner in time.
            </p>
          </div>
        </div>
        {/* Job details card */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          {isSameDayPortal && (
            <div className="bg-red-50 border-b border-red-100 px-4 py-2.5 flex items-center gap-2">
              <span>⚡</span>
              <p className="text-red-700 font-bold text-sm">Same-Day Check-In — guests arrive today</p>
            </div>
          )}
          <div className="p-4 space-y-2.5">
            {job?.address && (
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-0.5">Address</p>
                <p className="text-gray-800 font-semibold text-sm">{job.address}</p>
              </div>
            )}
            <div className="flex gap-4 flex-wrap">
              {job?.checkoutTime && (
                <div>
                  <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-0.5">Guest Check-out</p>
                  <p className="text-gray-800 font-semibold text-sm">{job.checkoutTime}</p>
                </div>
              )}
              {job?.checkinDate && (
                <div>
                  <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-0.5">
                    {isSameDayPortal ? '⚡ Check-in (Today)' : 'Next Check-in'}
                  </p>
                  <p className={`font-semibold text-sm ${isSameDayPortal ? 'text-red-600' : 'text-gray-800'}`}>
                    {isSameDayPortal
                      ? job.checkinTime ?? new Date(job.checkinDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : `${new Date(job.checkinDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${job.checkinTime ? ` · ${job.checkinTime}` : ''}`
                    }
                  </p>
                </div>
              )}
            </div>
            {job?.doorCode && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mt-1">
                <p className="text-blue-400 text-xs font-semibold uppercase tracking-wide mb-1">Door Code</p>
                <p className="text-blue-900 font-bold text-3xl tracking-widest">{job.doorCode}</p>
              </div>
            )}
            {job?.notes && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800 mt-1">
                <strong>Notes:</strong> {job.notes}
              </div>
            )}
            {job?.laundromatAddress ? (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 mt-1">
                <div className="flex items-center gap-2 mb-1">
                  <span>🧺</span>
                  <p className="text-indigo-800 font-bold text-sm">Off-site Laundry Required</p>
                </div>
                <p className="text-indigo-700 text-xs ml-6">Take all linens to the laundromat after cleaning.</p>
                <p className="text-indigo-900 font-semibold text-sm ml-6 mt-1">{job.laundromatAddress}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-1 mt-1">
                <span className="text-sm">🧺</span>
                <p className="text-gray-400 text-xs">Laundry done at the property</p>
              </div>
            )}
          </div>
        </div>
        {/* Checklist */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Cleaning Checklist</h2>
            <span className={`text-sm font-semibold ${checklistDone === CHECKLIST_ITEMS.length ? 'text-green-600' : 'text-gray-400'}`}>
              {checklistDone}/{CHECKLIST_ITEMS.length}
            </span>
          </div>
          <div className="divide-y">
            {CHECKLIST_ITEMS.map(item => (
              <label key={item} className="flex items-center gap-3 px-4 py-3.5 cursor-pointer active:bg-gray-50 select-none">
                <input
                  type="checkbox"
                  checked={checklist[item] ?? false}
                  onChange={e => setChecklist(prev => ({ ...prev, [item]: e.target.checked }))}
                  className="w-5 h-5 rounded accent-blue-700 shrink-0"
                />
                <span className={`text-sm ${checklist[item] ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  {item}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-gray-800">Photos</h2>
            <p className="text-gray-400 text-xs mt-0.5">Photograph each room after cleaning</p>
          </div>
          <div className="p-4">
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {photos.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-sm flex items-center justify-center font-bold shadow"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-5 text-gray-400 text-sm font-medium active:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              {uploadingPhoto ? '⏳ Uploading...' : '📷 Take or Upload Photos'}
            </button>
          </div>
        </div>

        {/* Staging Reference Photos */}
        {((job?.photoUrl) || (job?.stagingPhotoUrls && job.stagingPhotoUrls.length > 0)) && (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-gray-800">Staging Reference</h2>
              <p className="text-gray-400 text-xs mt-0.5">How the property should look when you're done</p>
            </div>
            <div className="p-4 space-y-2">
              {job.photoUrl && (
                <div className="rounded-xl overflow-hidden border border-gray-100">
                  <img src={job.photoUrl} alt="Property listing" className="w-full object-cover max-h-56" />
                </div>
              )}
              {job.stagingPhotoUrls && job.stagingPhotoUrls.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {job.stagingPhotoUrls.map((url, i) => (
                    <div key={i} className="rounded-xl overflow-hidden border border-gray-100 aspect-square">
                      <img src={url} alt={`Staging ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Damage Notes */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-gray-800">Damage Notes</h2>
            <p className="text-gray-400 text-xs mt-0.5">Report any damage or issues found (optional)</p>
          </div>
          <div className="p-4">
            <textarea
              value={damageNotes}
              onChange={e => setDamageNotes(e.target.value)}
              placeholder="Describe any damage, broken items, stains, or issues..."
              rows={4}
              className="w-full text-sm text-gray-700 placeholder-gray-300 resize-none outline-none"
            />
          </div>
        </div>
      </div>
      </div>

      {/* Submit button — anchored to bottom */}
      <div className="shrink-0 bg-white border-t px-4 py-4 shadow-lg">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSubmit}
            disabled={submitting || checklistDone === 0}
            className="w-full bg-green-600 active:bg-green-700 text-white font-bold py-4 rounded-xl text-base disabled:opacity-50 transition-colors"
          >
            {submitting
              ? 'Submitting...'
              : `Submit Report  ·  ${checklistDone}/${CHECKLIST_ITEMS.length} done`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="text-gray-500 text-sm shrink-0">{label}</span>
      <span className="font-semibold text-gray-800 text-sm text-right">{value}</span>
    </div>
  );
}
