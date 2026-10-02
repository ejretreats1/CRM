// Shared transactional emails for the cleaning business.
import { APP_URL, escapeHtml } from './_auth';

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
  to: string; clientName?: string | null; propertyName: string; checkoutDate: string; amount: number; photos?: string[]; checklistDone?: number; checklistTotal?: number;
}) {
  const dateLabel = new Date(opts.checkoutDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const photos = (opts.photos ?? []).filter(u => /^https?:\/\//.test(u)).slice(0, 8);
  const subject = `Cleaning complete at ${opts.propertyName} — $${opts.amount.toFixed(2)} charged`;
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
            <tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5">Charged to card on file</td><td style="padding:6px 12px;font-size:18px;font-weight:700;color:#16a34a">$${opts.amount.toFixed(2)}</td></tr>
          </table>
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
