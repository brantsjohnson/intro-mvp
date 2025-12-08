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
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">You have a new message!</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="font-size: 16px; margin: 0 0 20px 0;">
              <strong>${this.escapeHtml(senderName)}</strong> sent you a message on Intro.
            </p>
            ${messagePreview ? `
              <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #667eea; margin: 20px 0;">
                <p style="margin: 0; font-style: italic; color: #666;">"${this.escapeHtml(messagePreview)}"</p>
              </div>
            ` : ''}
            <div style="text-align: center; margin: 30px 0;">
              <a href="${link}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                View Message
              </a>
            </div>
            <p style="font-size: 14px; color: #666; margin: 30px 0 0 0; text-align: center;">
              <a href="${link}" style="color: #667eea; text-decoration: none;">${link}</a>
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

