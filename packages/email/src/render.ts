import { render } from '@react-email/components';
import PasswordResetEmail from '../templates/reset-password.js';

export interface RenderPasswordResetParams {
  userName?: string;
  resetUrl: string;
}

export async function renderPasswordReset(params: RenderPasswordResetParams): Promise<string> {
  return await render(PasswordResetEmail({ ...params, currentYear: new Date().getFullYear() }));
}
