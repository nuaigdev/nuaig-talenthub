import 'server-only'
import { appOnlyClient, wrapGraphError } from './client'
import { mailEnv } from '../env'
import { logger } from '../logger'

/**
 * Outbound mail via Graph `sendMail` from the shared confirmation mailbox
 * (spec.md §3 decision 6).
 *
 * `sendMail` below is deliberately generic — recipients, subject and body are
 * all parameters, and nothing about it assumes a candidate. Adding recruiter
 * notifications later (§11) is a call to this function, not a redesign.
 */

export type MailMessage = {
  to: string[]
  subject: string
  /** Plain-text body; converted to minimal HTML for the sent message. */
  text: string
  html?: string
}

export async function sendMail(message: MailMessage): Promise<void> {
  const client = appOnlyClient()

  try {
    await client.api(`/users/${encodeURIComponent(mailEnv.confirmationMailbox)}/sendMail`).post({
      message: {
        subject: message.subject,
        body: {
          contentType: message.html ? 'HTML' : 'Text',
          content: message.html ?? message.text,
        },
        toRecipients: message.to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    })
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'send mail')
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type ConfirmationSummary = {
  candidateId: string
  fullName: string
  email: string
  phone: string
  location: string
  linkedIn: string
  position: string
  yearsExperience: number
  relevantExperience: number
  willingToRelocate: string
  currentlyEmployed: string
  currentCompany: string
  currentJobTitle: string
  highestQualification: string
  undergraduateCollege: string
  undergraduateCGPA: string
  postgraduateCollege: string
  postgraduateCGPA: string
  certifications: string
  currentCTC: string
  variableComponent: string
  expectedCTC: string
  ctcNegotiable: string
  noticePeriod: string
  noticePeriodNegotiable: string
  agencyCode: string
  applicationDate: string
  resumeBytes: number
  videoBytes: number
}

function formatBytes(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

/**
 * Every line of the summary, in the order the candidate filled them in.
 * Optional fields the candidate skipped are dropped rather than shown blank —
 * a receipt should reflect what was actually submitted.
 */
function summaryRows(input: ConfirmationSummary): Array<[string, string]> {
  const years = (value: number) => `${value} ${value === 1 ? 'year' : 'years'}`

  return (
    [
      ['Position applied for', input.position],
      ['Full name', input.fullName],
      ['Email', input.email],
      ['Phone', input.phone],
      ['Location', input.location],
      ['Willing to relocate', input.willingToRelocate],
      ['LinkedIn', input.linkedIn],
      ['Total experience', years(input.yearsExperience)],
      ['Relevant experience', years(input.relevantExperience)],
      ['Currently employed', input.currentlyEmployed],
      ['Current organisation', input.currentCompany],
      ['Current job title', input.currentJobTitle],
      ['Highest qualification', input.highestQualification],
      ['Undergraduate college', input.undergraduateCollege],
      ['Undergraduate CGPA', input.undergraduateCGPA],
      ['Postgraduate college', input.postgraduateCollege],
      ['Postgraduate CGPA', input.postgraduateCGPA],
      ['Certifications', input.certifications],
      ['Current CTC', input.currentCTC],
      ['Variable component', input.variableComponent],
      ['Expected CTC', input.expectedCTC],
      ['Expected CTC negotiable', input.ctcNegotiable],
      ['Notice period', input.noticePeriod],
      ['Notice period negotiable', input.noticePeriodNegotiable],
      ['Agency code', input.agencyCode],
      ['Resume', input.resumeBytes ? `Received (${formatBytes(input.resumeBytes)})` : ''],
      [
        'Introduction video',
        input.videoBytes ? `Received (${formatBytes(input.videoBytes)})` : '',
      ],
      ['Submitted', formatWhen(input.applicationDate)],
    ] as Array<[string, string]>
  ).filter(([, value]) => value.trim().length > 0)
}

/**
 * Candidate confirmation: their tracking number plus a receipt of everything
 * they submitted.
 *
 * Written as tables with inline styles because that is what email clients
 * actually render — Outlook ignores a <style> block and has no flexbox or grid.
 *
 * A plain-text version is built alongside and passed to `sendMail`, which sends
 * the HTML when both are present: Graph's `sendMail` message carries a single
 * body, so a true multipart/alternative would mean hand-building MIME. The text
 * version is what a caller gets if it ever sends this content without HTML, and
 * it keeps the copy readable in one place.
 *
 * Never throws. The application is already recorded by the time this runs, so a
 * mail outage must not turn a successful submission into a failure the
 * candidate is told to retry — it is logged and swallowed.
 */
export async function sendCandidateConfirmation(input: ConfirmationSummary): Promise<boolean> {
  const firstName = input.fullName.split(' ')[0] || 'there'
  const rows = summaryRows(input)

  const text = [
    `Hi ${firstName},`,
    '',
    `Thank you for applying for the ${input.position} role. We have received your`,
    'application along with your resume and introduction video.',
    '',
    `YOUR TRACKING NUMBER: ${input.candidateId}`,
    'Please quote it in any correspondence with us.',
    '',
    'WHAT YOU SUBMITTED',
    '------------------',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'If anything above looks wrong, reply to this email with your tracking',
    'number and we will correct it.',
    '',
    'Our team will review your application and be in touch if there is a match.',
    '',
    'Best regards,',
    'NuAIg Talent Team',
  ].join('\n')

  const rowsHtml = rows
    .map(
      ([label, value], index) => `
        <tr>
          <td style="padding:10px 16px;${index ? 'border-top:1px solid #E5E9EF;' : ''}width:42%;color:#5B6472;font-size:14px;vertical-align:top;">
            ${escapeHtml(label)}
          </td>
          <td style="padding:10px 16px;${index ? 'border-top:1px solid #E5E9EF;' : ''}color:#111111;font-size:14px;font-weight:500;vertical-align:top;">
            ${escapeHtml(value)}
          </td>
        </tr>`,
    )
    .join('')

  const html = `
<body style="margin:0;padding:0;background:#F7F9FB;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FB;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E5E9EF;border-radius:10px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

          <tr>
            <td style="padding:28px 28px 4px 28px;">
              <p style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#111111;">
                Application received
              </p>
              <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#111111;">
                Hi ${escapeHtml(firstName)}, thank you for applying for the
                <strong>${escapeHtml(input.position)}</strong> role. We have your application,
                your resume and your introduction video.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 28px 20px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E6F5FC;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px;text-align:center;">
                    <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#5B6472;">
                      Your tracking number
                    </p>
                    <p style="margin:0;font-size:22px;font-weight:600;color:#069BDF;letter-spacing:0.01em;">
                      ${escapeHtml(input.candidateId)}
                    </p>
                    <p style="margin:6px 0 0 0;font-size:12px;color:#5B6472;">
                      Please quote this in any correspondence with us.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 28px 8px 28px;">
              <p style="margin:0 0 10px 0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#5B6472;">
                What you submitted
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E9EF;border-radius:8px;border-collapse:separate;overflow:hidden;">
                ${rowsHtml}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 28px 28px;">
              <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#5B6472;">
                If anything above looks wrong, reply to this email with your tracking number
                and we will correct it.
              </p>
              <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#111111;">
                Our team will review your application and be in touch if there is a match.
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#5B6472;">
                Best regards,<br/>NuAIg Talent Team
              </p>
            </td>
          </tr>

        </table>

        <p style="max-width:600px;margin:14px auto 0 auto;font-size:11px;line-height:1.5;color:#8A93A1;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          You are receiving this because an application was submitted with this email address.
          Your information is used for recruitment purposes only.
        </p>
      </td>
    </tr>
  </table>
</body>`.trim()

  try {
    await sendMail({
      to: [input.email],
      subject: `Application received — ${input.candidateId}`,
      text,
      html,
    })
    logger.info('Confirmation email sent', {
      operation: 'send_confirmation',
      candidateId: input.candidateId,
    })
    return true
  } catch (error) {
    logger.error('Confirmation email failed', error, {
      operation: 'send_confirmation',
      candidateId: input.candidateId,
    })
    return false
  }
}
