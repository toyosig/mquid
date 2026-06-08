import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter | null = null;
  private readonly fromEmail: string;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {
    const gmailUser = this.config.get<string>('GMAIL_USER');
    const gmailPass = this.config.get<string>('GMAIL_APP_PASSWORD');

    this.fromEmail = `MyMquid Elevate <${gmailUser ?? 'noreply@mymquid.com'}>`;

    if (gmailUser && gmailPass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      });
      this.logger.log(`Mail service ready (Gmail: ${gmailUser})`);
    } else {
      this.logger.warn('GMAIL_USER / GMAIL_APP_PASSWORD not set — emails will be logged to console only');
    }
  }

  async sendInviteEmail(to: string, name: string, inviteLink: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[DEV] Invite email to ${to} — link: ${inviteLink}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromEmail,
        to,
        subject: 'You have been invited to MyMquid Elevate',
        html: this.inviteTemplate(name, inviteLink),
      });
      this.logger.log(`Invite email sent to ${to}`);
    } catch (err: any) {
      this.logger.error(`Failed to send invite email to ${to}: ${err.message}`);
      throw new Error(`Email delivery failed: ${err.message}`);
    }
  }

  private inviteTemplate(name: string, inviteLink: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1e293b;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
                MyMquid Elevate
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;font-size:16px;color:#374151;">Hi <strong>${name}</strong>,</p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                You have been invited to join the <strong>MyMquid Elevate</strong> admin platform.
                Click the button below to set your password and activate your account.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                <tr>
                  <td style="border-radius:6px;background:#6366f1;">
                    <a href="${inviteLink}"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
                      Set Your Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 32px;font-size:13px;color:#6366f1;word-break:break-all;">
                ${inviteLink}
              </p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px;" />

              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
                This invite link expires in <strong>48 hours</strong>. If you were not expecting
                this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © 2026 MyMquid. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
