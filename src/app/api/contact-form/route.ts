import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = process.env.RESEND_FROM_EMAIL  || 'notifications@introevent.site'
const OWNER  = process.env.OWNER_EMAIL         || process.env.RESEND_FROM_EMAIL || ''

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { role, name, email, event, attendees, organizer, bcc } = body

    if (!role) {
      return NextResponse.json({ error: 'Missing role' }, { status: 400 })
    }

    if (!OWNER) {
      console.error('OWNER_EMAIL not set — cannot send notification')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
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

    /* ── Confirmation email to submitter (director gets one; sponsor/attendee only if they gave their email) ── */
    const submitterEmail = role === 'director' ? email : bcc
    if (submitterEmail) {
      const confirmations: Record<string, { subject: string; headline: string; body: string }> = {
        director: {
          subject:  "You're on the list — Intro",
          headline: "You're on the list.",
          body:     "We'll be in touch within one business day to talk through getting Intro set up for your event.",
        },
        sponsor: {
          subject:  "We'll reach out to your organizer — Intro",
          headline: "We'll reach out to them.",
          body:     "We'll contact your organizer on your behalf. You'll hear from us as soon as we make contact.",
        },
        attendee: {
          subject:  "We'll tell your organizer — Intro",
          headline: "We'll reach out to your organizer.",
          body:     "Your organizer will hear from us. Your name stays completely anonymous.",
        },
      }

      const conf = confirmations[role]
      if (conf) {
        const confirmHtml = `
          <div style="font-family:Arial,sans-serif;max-width:560px;color:#222019;">
            <h1 style="font-size:28px;margin:0 0 1rem;letter-spacing:-0.01em;">${conf.headline}</h1>
            <p style="font-size:15px;line-height:1.7;color:#3A3835;">${conf.body}</p>
            <hr style="margin:2rem 0;border:none;border-top:1px solid #BEBCB8;">
            <p style="font-size:12px;color:#7D7A73;">
              <strong style="color:#72A557;">Intro</strong> — Prove Event ROI<br>
              <a href="https://www.eventintroductions.com" style="color:#72A557;">eventintroductions.com</a>
            </p>
          </div>`

        await resend.emails.send({
          from:    `Brant at Intro <${FROM}>`,
          to:      submitterEmail,
          subject: conf.subject,
          html:    confirmHtml,
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('contact-form error:', err)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
