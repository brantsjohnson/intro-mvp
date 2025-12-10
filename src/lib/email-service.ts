/**
 * Email Service for sending notifications via Resend
 * 
 * Environment variables required:
 * - RESEND_API_KEY
 * - RESEND_FROM_EMAIL (optional, defaults to notifications@introevent.site)
 */

import { Resend } from 'resend'

interface SendEmailOptions {
  to: string
  subject: string
  html?: string
  text?: string
}

interface Attachment {
  filename: string
  content: Buffer | string
  cid?: string
}

interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export class EmailService {
  private resend: Resend | null
  private fromEmail: string

  constructor() {
    const apiKey = process.env.RESEND_API_KEY
    this.fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@introevent.site'
    this.resend = apiKey ? new Resend(apiKey) : null
  }

  /**
   * Check if email service is configured
   */
  isConfigured(): boolean {
    return this.resend !== null
  }

  /**
   * Send an email message
   */
  async sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<SendEmailResult> {
    if (!this.isConfigured()) {
      console.warn('Email service not configured - missing Resend API key')
      return {
        success: false,
        error: 'Email service not configured'
      }
    }

    try {
      // Validate email format
      if (!this.isValidEmail(to)) {
        return {
          success: false,
          error: 'Invalid email address format'
        }
      }

      // Use Resend SDK
      const { data, error } = await this.resend!.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: subject,
        html: html,
        text: text
      })

      if (error) {
        console.error('Resend API error:', error)
        return {
          success: false,
          error: error.message || 'Failed to send email'
        }
      }

      return {
        success: true,
        messageId: data?.id
      }
    } catch (error) {
      console.error('Error sending email:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Validate email address format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  /**
   * Send a message notification email
   */
  async sendMessageNotification(
    recipientEmail: string,
    senderName: string,
    messagePreview?: string,
    link: string = 'https://introevent.site'
  ): Promise<SendEmailResult> {
    const subject = `New message from ${senderName} on Intro`
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="https://fonts.googleapis.com/css2?family=Changa+One&family=Avenir+Next:wght@400;500&display=swap" rel="stylesheet">
        </head>
        <body style="font-family: 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3A3835; margin: 0; padding: 40px 20px; background-color: #EDEBE6;">
          <div style="max-width: 600px; margin: 0 auto;">
            <div style="background: rgba(237, 235, 230, 0.5); border: 1.5px solid #BEBCB8; border-radius: 56px; padding: 40px; box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.15);">
              <h1 style="font-family: 'Changa One', cursive; color: #3A3835; margin: 0 0 30px 0; font-size: 28px; text-align: center; text-transform: uppercase; letter-spacing: 0.02em;">You have a new message!</h1>
              <p style="font-size: 16px; margin: 0 0 20px 0; color: #3A3835;">
                <strong>${this.escapeHtml(senderName)}</strong> sent you a message on Intro.
              </p>
              ${messagePreview ? `
                <div style="background: rgba(237, 235, 230, 0.6); padding: 16px; border-radius: 8px; border-left: 4px solid #72A557; margin: 20px 0;">
                  <p style="margin: 0; font-style: italic; color: #7D7A73;">"${this.escapeHtml(messagePreview)}"</p>
                </div>
              ` : ''}
              <div style="text-align: center; margin: 30px 0;">
                <a href="${link}" style="display: inline-block; background: #72A557; color: #FFFFFF; text-decoration: none; padding: 12px 30px; border-radius: 48px; font-weight: 500; font-size: 16px; border: none;">
                  View Message
                </a>
              </div>
              <p style="font-size: 14px; color: #7D7A73; margin: 30px 0 0 0; text-align: center;">
                <a href="${link}" style="color: #72A557; text-decoration: none;">${link}</a>
              </p>
            </div>
            <p style="font-size: 12px; color: #7D7A73; margin-top: 24px; text-align: center;">
              Powered by <strong style="font-family: 'Changa One', cursive;">INTRO</strong>
            </p>
          </div>
        </body>
      </html>
    `

    const text = `You have a new message from ${senderName} on Intro.${messagePreview ? `\n\n"${messagePreview}"` : ''}\n\nView your message: ${link}`

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
      text
    })
  }

  /**
   * Send a match notification email
   */
  async sendMatchNotification(
    recipientEmail: string,
    eventName: string,
    matchCount: number,
    link: string = 'https://introevent.site'
  ): Promise<SendEmailResult> {
    const subject = `You have ${matchCount} new ${matchCount === 1 ? 'match' : 'matches'} on Intro!`
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="https://fonts.googleapis.com/css2?family=Changa+One&family=Avenir+Next:wght@400;500&display=swap" rel="stylesheet">
        </head>
        <body style="font-family: 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3A3835; margin: 0; padding: 40px 20px; background-color: #EDEBE6;">
          <div style="max-width: 600px; margin: 0 auto;">
            <div style="background: rgba(237, 235, 230, 0.5); border: 1.5px solid #BEBCB8; border-radius: 56px; padding: 40px; box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.15);">
              <h1 style="font-family: 'Changa One', cursive; color: #3A3835; margin: 0 0 30px 0; font-size: 28px; text-align: center; text-transform: uppercase; letter-spacing: 0.02em;">You have new matches!</h1>
              <p style="font-size: 16px; margin: 0 0 20px 0; color: #3A3835;">
                We found <strong>${matchCount} ${matchCount === 1 ? 'person' : 'people'}</strong> you should connect with at <strong>${this.escapeHtml(eventName)}</strong>.
              </p>
              <div style="background: rgba(237, 235, 230, 0.6); padding: 16px; border-radius: 8px; border-left: 4px solid #72A557; margin: 20px 0;">
                <p style="margin: 0; color: #7D7A73;">
                  ${matchCount === 1 
                    ? 'Your match is ready to view. Start a conversation and make a meaningful connection!' 
                    : 'Your matches are ready to view. Start conversations and make meaningful connections!'}
                </p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${link}" style="display: inline-block; background: #72A557; color: #FFFFFF; text-decoration: none; padding: 12px 30px; border-radius: 48px; font-weight: 500; font-size: 16px; border: none;">
                  View Matches
                </a>
              </div>
              <p style="font-size: 14px; color: #7D7A73; margin: 30px 0 0 0; text-align: center;">
                <a href="${link}" style="color: #72A557; text-decoration: none;">${link}</a>
              </p>
            </div>
            <p style="font-size: 12px; color: #7D7A73; margin-top: 24px; text-align: center;">
              Powered by <strong style="font-family: 'Changa One', cursive;">INTRO</strong>
            </p>
          </div>
        </body>
      </html>
    `

    const text = `You have ${matchCount} new ${matchCount === 1 ? 'match' : 'matches'} on Intro for ${eventName}.\n\nView your matches: ${link}`

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
      text
    })
  }

  /**
   * Send an email with attachments
   */
  async sendEmailWithAttachment({
    to,
    subject,
    html,
    text,
    attachments,
  }: SendEmailOptions & { attachments?: Attachment[] }): Promise<SendEmailResult> {
    if (!this.isConfigured()) {
      console.warn('Email service not configured - missing Resend API key')
      return {
        success: false,
        error: 'Email service not configured'
      }
    }

    try {
      // Validate email format
      if (!this.isValidEmail(to)) {
        return {
          success: false,
          error: 'Invalid email address format'
        }
      }

      // Convert attachments to Resend format
      const resendAttachments = attachments?.map(att => ({
        filename: att.filename,
        content: typeof att.content === 'string' 
          ? Buffer.from(att.content).toString('base64')
          : att.content.toString('base64'),
      }))

      // Use Resend SDK
      const { data, error } = await this.resend!.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: subject,
        html: html,
        text: text,
        attachments: resendAttachments,
      })

      if (error) {
        console.error('Resend API error:', error)
        return {
          success: false,
          error: error.message || 'Failed to send email'
        }
      }

      return {
        success: true,
        messageId: data?.id
      }
    } catch (error) {
      console.error('Error sending email:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }
    return text.replace(/[&<>"']/g, (m) => map[m])
  }
}

