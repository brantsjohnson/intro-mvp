import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL || 'notifications@introevent.site'
const OWNER = process.env.OWNER_EMAIL || 'brantshanonjohnson@gmail.com'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { role, name, email, event, attendees, organizer, bcc } = body

    if (!role) {
      return NextResponse.json({ error: 'Missing role' }, { status: 400 })
    }

    const roleLabel: Record<string, string> = {
      director: 'Event Director',
      sponsor:  'Sponsor',
      attendee: 'Attendee',
    }

    /* ── Email to you (Brant) ── */
    const ownerHtml = `
      <div style="font-family:Arial,sans-serif;max-width:560px;color:#222019;">
        <h2 style="margin:0 0 1rem;">New contact form submission</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#7D7A73;width:130px;">Role</td><td style="padding:8px 0;font-weight:600;">${roleLabel[role] ?? role}</td></tr>
          ${name      ? `<tr><td style="padding:8px 0;color:#7D7A73;">Name</td><td style="padding:8px 0;">${name}</td></tr>` : ''}
          ${email     ? `<tr><td style="padding:8px 0;color:#7D7A73;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}">${email}</a></td></tr>` : ''}
          ${event     ? `<tr><td style="padding:8px 0;color:#7D7A73;">Event</td><td style="padding:8px 0;">${event}</td></tr>` : ''}
          ${attendees ? `<tr><td style="padding:8px 0;color:#7D7A73;">Attendees</td><td style="padding:8px 0;">${attendees}</td></tr>` : ''}
          ${organizer ? `<tr><td style="padding:8px 0;color:#7D7A73;">Organizer</td><td style="padding:8px 0;"><a href="mailto:${organizer}">${organizer}</a></td></tr>` : ''}
          ${bcc       ? `<tr><td style="padding:8px 0;color:#7D7A73;">Their email</td><td style="padding:8px 0;"><a href="mailto:${bcc}">${bcc}</a></td></tr>` : ''}
        </table>
        <hr style="margin:1.5rem 0;border:none;border-top:1px solid #BEBCB8;">
        <p style="font-size:12px;color:#7D7A73;">Submitted via eventintroductions.com</p>
      </div>`

    await resend.emails.send({
      from:    `Intro <${FROM}>`,
      to:      OWNER,
      subject: `New ${roleLabel[role] ?? role} inquiry — ${event || 'no event listed'}`,
      html:    ownerHtml,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('contact-form error:', err)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
