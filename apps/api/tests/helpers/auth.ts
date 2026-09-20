import { HTTP_STATUS, TEST_USERS } from '../config';
import type { Member, Session, User, UserType } from '../types';
import type { TestClient } from './client';
import type { Database } from './database';

export class Auth {
  private readonly client: TestClient;
  private readonly db: Database;
  private readonly sessions = new Map<string, Session>();

  constructor(client: TestClient, db: Database) {
    this.client = client;
    this.db = db;
  }

  async loginAs(userType: UserType): Promise<Session> {
    const user = TEST_USERS[userType];
    return this.login(user.email, user.password);
  }

  async login(email: string, password: string): Promise<Session> {
    const existing = this.sessions.get(email);
    if (existing) {
      return existing;
    }

    await this.ensureUserExists(email, password);

    const signInRes = await this.client.post('/auth/sign-in/email', { email, password });
    if (signInRes.status !== HTTP_STATUS.OK) {
      throw new Error(`Login failed for ${email}: ${signInRes.status}`);
    }

    let cookie = this.extractCookie(signInRes.headers);

    // handle organization setup for non-citizen users
    const userConfig = this.getUserConfig(email);
    if (userConfig?.role !== 'citizen') {
      cookie = await this.setupOrganization(cookie);
    }

    const sessionRes = await this.client.get<{ user: User; session: { activeOrganizationId?: string } }>(
      '/auth/get-session',
      { Cookie: cookie },
    );

    let member: Member | null = null;
    if (sessionRes.data.session?.activeOrganizationId) {
      const orgRes = await this.client.get<{
        members: Member[];
      }>('/auth/organization/get-full-organization', { Cookie: cookie });

      if (orgRes.status === HTTP_STATUS.OK) {
        member = orgRes.data.members.find((m) => m.userId === sessionRes.data.user.id) || null;
      }
    }

    const session: Session = {
      cookie,
      user: sessionRes.data.user,
      member,
    };

    this.sessions.set(email, session);
    return session;
  }

  getHeaders(userType: UserType): Record<string, string> {
    const user = TEST_USERS[userType];
    const session = this.sessions.get(user.email);
    if (!session) {
      throw new Error(`User '${userType}' not logged in. Call loginAs() first.`);
    }
    return { Cookie: session.cookie };
  }

  clearSessions(): void {
    this.sessions.clear();
  }

  async ensureUserExists(email: string, password: string): Promise<string> {
    const existing = await this.db.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email]);
    if (existing[0]) {
      return existing[0].id;
    }

    const userConfig = this.getUserConfig(email);
    if (!userConfig) {
      throw new Error(`No test user config for ${email}`);
    }

    const signUpRes = await this.client.post('/auth/sign-up/email', {
      email,
      password,
      name: userConfig.name,
    });

    if (signUpRes.status !== HTTP_STATUS.OK && signUpRes.status !== HTTP_STATUS.CREATED) {
      throw new Error(`Sign-up failed for ${email}: ${signUpRes.status}`);
    }

    const newUser = await this.db.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email]);
    if (!newUser[0]) {
      throw new Error(`Failed to get user ID for ${email}`);
    }

    return newUser[0].id;
  }

  private extractCookie(headers: Headers): string {
    const cookieHeader = headers.get('set-cookie');
    if (!cookieHeader) {
      throw new Error('No session cookie received');
    }

    const [cookie] = cookieHeader.split(';');
    if (!cookie) {
      throw new Error('Invalid cookie format');
    }

    return cookie;
  }

  private async setupOrganization(cookie: string): Promise<string> {
    const orgRes = await this.client.get<Array<{ id: string }>>('/auth/organization/list', { Cookie: cookie });
    const org = orgRes.data?.[0];

    if (!org) {
      return cookie;
    }

    const setActiveRes = await this.client.post(
      '/auth/organization/set-active',
      { organizationId: org.id },
      { Cookie: cookie },
    );

    const newCookieHeader = setActiveRes.headers.get('set-cookie');
    if (newCookieHeader) {
      const [newCookie] = newCookieHeader.split(';');
      if (newCookie) {
        return newCookie;
      }
    }

    return cookie;
  }

  private getUserConfig(email: string) {
    return Object.values(TEST_USERS).find((u) => u.email === email);
  }
}
