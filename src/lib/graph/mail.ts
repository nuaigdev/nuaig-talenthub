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

/**
 * Candidate confirmation containing their Candidate ID.
 *
 * Never throws. The application has already been recorded by the time this
 * runs, so a mail outage must not turn a successful submission into a failure
 * the candidate is told to retry — it is logged and swallowed.
 */
export async function sendCandidateConfirmation(input: {
  candidateId: string
  fullName: string
  email: string
  position: string
}): Promise<boolean> {
  const firstName = input.fullName.split(' ')[0] || 'there'
  const text = [
    `Hi ${firstName},`,
    '',
    `Thank you for applying for the ${input.position} role. We have received your application and your documents.`,
    '',
    `Your Candidate ID is ${input.candidateId}. Please quote it in any correspondence with us.`,
    '',
    'Our team will review your application and be in touch if there is a match.',
    '',
    'Best regards,',
    'NuAIg Talent Team',
  ].join('\n')

  const html = `
    <div style="font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:#111111;line-height:1.6;">
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Thank you for applying for the <strong>${escapeHtml(input.position)}</strong> role.
         We have received your application and your documents.</p>
      <p style="background:#E6F5FC;border-radius:8px;padding:12px 16px;">
        Your Candidate ID is <strong style="color:#069BDF;">${escapeHtml(input.candidateId)}</strong>.
        Please quote it in any correspondence with us.
      </p>
      <p>Our team will review your application and be in touch if there is a match.</p>
      <p style="color:#5B6472;">Best regards,<br/>NuAIg Talent Team</p>
    </div>
  `.trim()

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
