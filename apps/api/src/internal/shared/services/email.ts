import { renderPasswordReset } from '@lima-garbage/email';
import { Resend } from 'resend';
import type { EmailConfig } from '@/internal/shared/config/config';

export class EmailService {
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(config: EmailConfig) {
    this.resend = new Resend(config.resendApiKey);
    this.fromEmail = config.fromEmail;
    this.fromName = config.fromName;
  }

  // resetUrl is Better Auth's own callback. It checks the token and redirects to
  // the page with ?token= or ?error=, so the link must reach it unaltered.
  async sendPasswordResetEmail(to: string, resetUrl: string, userName?: string): Promise<void> {
    try {
      const html = await renderPasswordReset({ userName, resetUrl });

      // Resend reports a rejected send in the result rather than by throwing.
      const { error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: [to],
        subject: 'Restablecer tu contraseña (lima-limpia.pe)',
        html,
      });

      if (error) {
        throw new Error(`${error.name}: ${error.message}`);
      }
    } catch (error) {
      throw new Error('Failed to send password reset email', { cause: error });
    }
  }
}
