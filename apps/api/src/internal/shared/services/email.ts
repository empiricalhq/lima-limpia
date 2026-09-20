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

  async sendPasswordResetEmail(to: string, resetUrl: string, userName?: string): Promise<void> {
    const frontendResetUrl = this.constructFrontendResetUrl(resetUrl);

    try {
      const html = await renderPasswordReset({
        userName,
        resetUrl: frontendResetUrl,
      });

      await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: [to],
        subject: 'Restablecer tu contraseña (lima-limpia.pe)',
        html,
      });
    } catch (error) {
      throw new Error('Failed to send password reset email', { cause: error });
    }
  }

  private constructFrontendResetUrl(betterAuthUrl: string): string {
    try {
      const url = new URL(betterAuthUrl);

      // Better Auth puts the reset token in the generated URL path.
      const pathParts = url.pathname.split('/');
      const token = pathParts.at(-1);

      // The callback URL identifies the frontend page that receives the token.
      const callbackURL = url.searchParams.get('callbackURL');

      if (!(callbackURL && token)) {
        return betterAuthUrl;
      }

      const frontendUrl = new URL(callbackURL);
      frontendUrl.searchParams.set('token', token);

      return frontendUrl.toString();
    } catch {
      return betterAuthUrl;
    }
  }
}
