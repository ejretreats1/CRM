// Shared transactional emails for the cleaning business.
import { APP_URL, escapeHtml } from './_auth.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Resend = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export const CLEANING_FROM = 'E&J Retreats Cleaning <cleaning@ejretreats.com>';

/** Resend v6 returns { data, error }; normalise to the email id or throw. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function emailIdOrThrow(result: any): string | undefined {
  if (result?.error) throw new Error(result.error.message ?? 'Email failed');
  return result?.data?.id ?? result?.id;
}

/** Same, but returns null (and logs) instead of throwing — for fire-and-forget sends. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function emailId(result: any): string | null {
  if (!result) return null;
  if (result.error) { console.error('[resend]', result.error.message ?? result.error); return null; }
  return result.data?.id ?? result.id ?? null;
}

export function cleanerPortalUrl(cleaner: Row, dashToken: string): string {
  const nameSlug = String(cleaner.name ?? '').trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  return `${APP_URL}/cleaner?cleaner-dashboard=${nameSlug}:${cleaner.id}:${dashToken}`;
}

/** "You're all set" email with the cleaner's portal link and save-as-app steps. */
export async function sendCleanerPortalEmail(resend: Resend, cleaner: Row, dashToken: string) {
  const portalUrl = cleanerPortalUrl(cleaner, dashToken);
  const firstName = escapeHtml(String(cleaner.name ?? '').split(' ')[0]);
  const portalAppName = `${escapeHtml(cleaner.name)} Cleaner Portal`;
  const subject = `🎉 You're all set, ${firstName}! Save your Cleaner Portal`;
  const result = await resend.emails.send({
    from: CLEANING_FROM,
    to: cleaner.email,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc">
        <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
          <h2 style="color:#1e40af;margin:0 0 4px;font-size:22px">🎉 You're Fully Onboarded!</h2>
          <p style="color:#64748b;font-size:13px;margin:0 0 24px">Agreement signed ✅ &nbsp;·&nbsp; Stripe connected ✅</p>

          <p style="color:#334155;margin:0 0 16px">Hi ${firstName},</p>
          <p style="color:#334155;margin:0 0 24px">You're all set to start receiving cleaning jobs and payouts from E&amp;J Retreats. Your personal Cleaner Portal is where you'll see your upcoming jobs, accept new assignments, and track your pay.</p>

          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin:0 0 28px;text-align:center">
            <p style="margin:0 0 6px;font-size:13px;color:#1e40af;font-weight:700;letter-spacing:0.05em">YOUR CLEANER PORTAL</p>
            <a href="${portalUrl}" style="display:inline-block;background:#1e40af;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;margin:8px 0">${portalAppName}</a>
            <p style="margin:10px 0 0;font-size:11px;color:#64748b;word-break:break-all">${portalUrl}</p>
          </div>

          <p style="color:#1e293b;font-weight:700;font-size:15px;margin:0 0 12px">📱 Save this as an app on your phone</p>
          <p style="color:#475569;font-size:13px;margin:0 0 16px">This link works like a mobile app — add it to your home screen so you can open it with one tap, just like any other app.</p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin:0 0 16px">
            <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0f172a">🍎 iPhone (Safari)</p>
            <ol style="margin:0;padding-left:20px;color:#334155;font-size:13px;line-height:2">
              <li>Open the link above in <strong>Safari</strong> (not Chrome)</li>
              <li>Tap the <strong>Share button</strong> <span style="background:#e2e8f0;padding:1px 5px;border-radius:4px;font-size:12px">⬆</span> at the bottom of the screen</li>
              <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
              <li>Set the name to <strong>${portalAppName}</strong></li>
              <li>Tap <strong>"Add"</strong> in the top right corner</li>
            </ol>
          </div>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin:0 0 24px">
            <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0f172a">🤖 Android (Chrome)</p>
            <ol style="margin:0;padding-left:20px;color:#334155;font-size:13px;line-height:2">
              <li>Open the link above in <strong>Chrome</strong></li>
              <li>Tap the <strong>three dots menu</strong> <span style="background:#e2e8f0;padding:1px 5px;border-radius:4px;font-size:12px">⋮</span> in the top right</li>
              <li>Tap <strong>"Add to Home screen"</strong></li>
              <li>Set the name to <strong>${portalAppName}</strong></li>
              <li>Tap <strong>"Add"</strong></li>
            </ol>
          </div>

          <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center">Welcome to the team! Contact E&amp;J Retreats if you need anything.<br>— E&amp;J Retreats</p>
        </div>
      </div>
    `,
  });
  return { id: emailIdOrThrow(result), subject, portalUrl };
}

/** Receipt to the client after a cleaning is charged, with the cleaner's photos. */
export async function sendClientReceiptEmail(resend: Resend, opts: {
  to: string; clientName?: string | null; propertyName: string; checkoutDate: string;
  /** Amount charged to the card on file; omit / 0 when nothing was charged (yet) */
  amount?: number | null; photos?: string[]; checklistDone?: number; checklistTotal?: number;
  /** Shown when the charge didn't happen, e.g. "Your card will be charged once the payment retries succeed." */
  paymentNote?: string | null;
}) {
  const dateLabel = new Date(opts.checkoutDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const photos = (opts.photos ?? []).filter(u => /^https?:\/\//.test(u)).slice(0, 8);
  const amount = Number(opts.amount ?? 0);
  const subject = amount > 0 ? `Cleaning complete at ${opts.propertyName} — $${amount.toFixed(2)} charged` : `Cleaning complete at ${opts.propertyName}`;
  const result = await resend.emails.send({
    from: CLEANING_FROM,
    to: opts.to,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
        <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
          <h2 style="color:#1e40af;margin:0 0 16px">✨ Your property is guest-ready</h2>
          <p style="color:#334155">Hi ${escapeHtml(opts.clientName ?? 'there')},</p>
          <p style="color:#334155">The turnover clean at <strong>${escapeHtml(opts.propertyName)}</strong> after the ${dateLabel} checkout is complete.</p>
          <table style="border-collapse:collapse;width:100%;font-size:14px;margin:16px 0">
            <tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5">Property</td><td style="padding:6px 12px">${escapeHtml(opts.propertyName)}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5">Checkout</td><td style="padding:6px 12px">${dateLabel}</td></tr>
            ${opts.checklistTotal ? `<tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5">Checklist</td><td style="padding:6px 12px">${opts.checklistDone ?? 0} / ${opts.checklistTotal} items completed</td></tr>` : ''}
            ${amount > 0 ? `<tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5">Charged to card on file</td><td style="padding:6px 12px;font-size:18px;font-weight:700;color:#16a34a">$${amount.toFixed(2)}</td></tr>` : ''}
          </table>
          ${opts.paymentNote ? `<p style="color:#64748b;font-size:13px">${escapeHtml(opts.paymentNote)}</p>` : ''}
          ${photos.length ? `<p style="font-weight:600;color:#334155;margin:16px 0 6px">Photos from your cleaner</p><div>${photos.map(u => `<img src="${u}" style="width:120px;height:90px;object-fit:cover;border-radius:6px;margin:4px" />`).join('')}</div>` : ''}
          <p style="color:#64748b;font-size:13px;margin-top:20px">Not happy with something? Reply to this email within 24 hours and we'll arrange a free re-clean or credit.</p>
          <p style="color:#94a3b8;font-size:12px;margin:16px 0 0">— E&amp;J Retreats Cleaning</p>
        </div>
      </div>
    `,
  });
  return { id: emailIdOrThrow(result), subject };
}

/** Ask the client to update a declined card. */
export async function sendCardUpdateEmail(resend: Resend, opts: { to: string; clientName?: string | null; propertyName: string; amount: number; reason?: string; link: string }) {
  const subject = `Action needed: update your card for cleaning at ${opts.propertyName}`;
  const result = await resend.emails.send({
    from: CLEANING_FROM,
    to: opts.to,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
        <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
          <h2 style="color:#b45309;margin:0 0 16px">💳 We couldn't charge your card</h2>
          <p style="color:#334155">Hi ${escapeHtml(opts.clientName ?? 'there')},</p>
          <p style="color:#334155">The $${opts.amount.toFixed(2)} charge for the latest cleaning at <strong>${escapeHtml(opts.propertyName)}</strong> was declined${opts.reason ? ` (${escapeHtml(opts.reason)})` : ''}.</p>
          <p style="color:#334155">Please add a new card so we can keep your turnovers on schedule. We'll retry the charge automatically once it's updated.</p>
          <p style="margin:28px 0;text-align:center">
            <a href="${opts.link}" style="background:#1e40af;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">Update Card</a>
          </p>
          <p style="color:#94a3b8;font-size:12px;text-align:center">This link expires in 7 days. Questions? Just reply to this email.&nbsp;&mdash;&nbsp;E&amp;J Retreats</p>
        </div>
      </div>
    `,
  });
  return { id: emailIdOrThrow(result), subject };
}

// ── Job emails to cleaners ───────────────────────────────────────────────────

const JOB_TYPE_META: Record<string, { emoji: string; label: string; intro: string }> = {
  cleaning: { emoji: '🧹', label: 'Cleaning Job',  intro: 'A cleaning job is available for one of your assigned properties. Tap the button below to accept or pass.' },
  handyman: { emoji: '🔧', label: 'Handyman Job',  intro: 'A handyman job is available. Review the details below and tap the button to accept or pass.' },
  lawncare: { emoji: '🌿', label: 'Lawn Care Job', intro: 'A lawn care job is available. Review the details below and tap the button to accept or pass.' },
};

function longDate(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }

/** "Job available — accept or pass" sent to one cleaner at a time. */
export async function sendJobOfferEmail(resend: Resend, opts: { to: string; name: string; job: Row; payout: number; portalLink: string }) {
  const { job } = opts;
  const meta = JOB_TYPE_META[job.job_type ?? 'cleaning'] ?? JOB_TYPE_META.cleaning;
  const subject = `${meta.emoji} ${meta.label} Available: ${job.property_name} – ${longDate(job.checkout_date)}${job.same_day ? ' ⚡ same-day turnover' : ''}`;
  const result = await resend.emails.send({
    from: CLEANING_FROM,
    to: opts.to,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
        <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
          <h2 style="color:#1e40af;margin:0 0 8px;font-size:20px">${meta.emoji} ${meta.label} Available</h2>
          <p style="color:#334155;margin:0 0 20px">Hi ${escapeHtml(opts.name)},</p>
          <p style="color:#334155;margin:0 0 16px">${meta.intro}</p>
          ${job.same_day ? '<p style="background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:8px;padding:10px 12px;font-weight:600;margin:0 0 16px">⚡ Same-day turnover — the next guest checks in the same day, so this clean must be done between checkout and check-in.</p>' : ''}
          <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:0 0 20px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:4px 0;color:#64748b;font-size:14px;width:130px">Property</td><td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:14px">${escapeHtml(job.property_name)}</td></tr>
              <tr><td style="padding:4px 0;color:#64748b;font-size:14px">${meta.label === 'Cleaning Job' ? 'Cleaning Date' : 'Job Date'}</td><td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:14px">${longDate(job.checkout_date)}</td></tr>
              ${job.checkin_date ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px">Next Check-in</td><td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:14px">${new Date(job.checkin_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</td></tr>` : ''}
              ${job.guest_name ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px">Departing Guest</td><td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:14px">${escapeHtml(job.guest_name)}</td></tr>` : ''}
              ${opts.payout ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px">Your Payout</td><td style="padding:4px 0;font-weight:700;color:#16a34a;font-size:18px">$${opts.payout}</td></tr>` : ''}
              ${job.notes ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px;vertical-align:top">Notes</td><td style="padding:4px 0;color:#0f172a;font-size:14px">${escapeHtml(job.notes)}</td></tr>` : ''}
            </table>
          </div>
          <div style="text-align:center;margin:24px 0">
            <a href="${opts.portalLink}" style="background:#1e40af;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">View &amp; Accept Job</a>
          </div>
          <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">If you can't take it, tap the link and choose Pass so the next cleaner is offered the job quickly. — E&amp;J Retreats</p>
        </div>
      </div>
    `,
  });
  return { id: emailIdOrThrow(result), subject };
}

export async function sendJobCancelledEmail(resend: Resend, opts: { to: string; name: string; propertyName: string; checkoutDate: string; reason?: string }) {
  const subject = `Cleaning Cancelled — ${opts.propertyName} (${longDate(opts.checkoutDate)})`;
  const result = await resend.emails.send({
    from: CLEANING_FROM, to: opts.to, subject,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
        <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
          <h2 style="color:#dc2626;margin:0 0 12px;font-size:20px">Cleaning Cancelled</h2>
          <p style="color:#334155">Hi ${escapeHtml(opts.name)},</p>
          <p style="color:#334155">The cleaning at <strong>${escapeHtml(opts.propertyName)}</strong> on <strong>${longDate(opts.checkoutDate)}</strong> has been cancelled${opts.reason ? ` — ${escapeHtml(opts.reason)}` : ''}. No action needed.</p>
          <p style="color:#94a3b8;font-size:12px;margin:16px 0 0">— E&amp;J Retreats Cleaning</p>
        </div>
      </div>`,
  });
  return { id: emailIdOrThrow(result), subject };
}

export async function sendJobRescheduledEmail(resend: Resend, opts: { to: string; name: string; propertyName: string; oldDate: string; newDate: string; nextCheckIn?: string | null; sameDay?: boolean }) {
  const subject = `Date changed — ${opts.propertyName}: now ${longDate(opts.newDate)}`;
  const result = await resend.emails.send({
    from: CLEANING_FROM, to: opts.to, subject,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
        <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
          <h2 style="color:#b45309;margin:0 0 12px;font-size:20px">📅 Cleaning date changed</h2>
          <p style="color:#334155">Hi ${escapeHtml(opts.name)},</p>
          <p style="color:#334155">The guest's dates moved. The cleaning at <strong>${escapeHtml(opts.propertyName)}</strong> is now on <strong>${longDate(opts.newDate)}</strong> (was ${longDate(opts.oldDate)}).${opts.nextCheckIn ? ` Next check-in: ${longDate(opts.nextCheckIn)}.` : ''}${opts.sameDay ? ' <strong>⚡ Same-day turnover.</strong>' : ''}</p>
          <p style="color:#334155">Your portal link stays the same. If the new date doesn't work for you, open the job and pass it so someone else can take it.</p>
          <p style="color:#94a3b8;font-size:12px;margin:16px 0 0">— E&amp;J Retreats Cleaning</p>
        </div>
      </div>`,
  });
  return { id: emailIdOrThrow(result), subject };
}

/** "Please submit your cleaning report" — sent by the admin for an overdue report. */
export async function sendReportReminderEmail(resend: Resend, opts: { to: string; name: string; propertyName: string; checkoutDate: string; portalLink: string; dashboardLink?: string | null }) {
  const subject = `Reminder: submit your cleaning report — ${opts.propertyName} (${longDate(opts.checkoutDate)})`;
  const result = await resend.emails.send({
    from: CLEANING_FROM, to: opts.to, subject,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
        <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
          <h2 style="color:#b45309;margin:0 0 12px;font-size:20px">📋 Cleaning report still needed</h2>
          <p style="color:#334155">Hi ${escapeHtml(opts.name)},</p>
          <p style="color:#334155">We don't have your report yet for the clean at <strong>${escapeHtml(opts.propertyName)}</strong> on <strong>${longDate(opts.checkoutDate)}</strong>. Your payout is released as soon as the report is in, so please take a minute to submit it: photos, checklist, and any damage or supply notes.</p>
          <div style="text-align:center;margin:24px 0">
            <a href="${opts.portalLink}" style="background:#1e40af;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">Submit Cleaning Report</a>
          </div>
          ${opts.dashboardLink ? `<p style="color:#64748b;font-size:13px;text-align:center">Or open your <a href="${opts.dashboardLink}" style="color:#1e40af">Cleaner Portal</a> and tap the job under "Needs report".</p>` : ''}
          <p style="color:#94a3b8;font-size:12px;margin:16px 0 0">— E&amp;J Retreats Cleaning</p>
        </div>
      </div>`,
  });
  return { id: emailIdOrThrow(result), subject };
}
