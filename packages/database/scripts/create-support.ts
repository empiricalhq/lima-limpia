import { cancel, group, intro, log, note, outro, password, spinner, text } from '@clack/prompts';
import { Pool } from 'pg';
import color from 'picocolors';
import { createAppAuth, PlatformRoles, withTransaction } from '../src/auth/index.ts';
import { mustEnv, optionalEnv } from './env.js';

const MIN_NAME_LENGTH = 5;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

const DATABASE_URL = mustEnv('DATABASE_URL');
const AUTH_SECRET = mustEnv('BETTER_AUTH_SECRET');

export const db = new Pool({ connectionString: DATABASE_URL });

export const auth = createAppAuth({
  pool: db,
  secret: AUTH_SECRET,
  baseURL: optionalEnv('BETTER_AUTH_URL', 'http://localhost:4000'),
});

/**
 * Creates a platform support account: a dedicated user whose global role is `support`, with no
 * membership in any municipality. An email that already has an account is refused, so a citizen or
 * a municipality's staff member is never promoted and a support account never doubles as one.
 */
export async function grantSupport(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ userId: string }> {
  const { rows } = await db.query('SELECT 1 FROM "user" WHERE email = $1', [input.email.toLowerCase()]);
  if (rows.length > 0) {
    throw new Error(`Ya existe una cuenta con el correo ${input.email}. Una cuenta de soporte debe ser nueva.`);
  }

  const { user } = await auth.api.createUser({
    body: { name: input.name, email: input.email, password: input.password, role: PlatformRoles.SUPPORT },
  });
  return { userId: user.id };
}

/**
 * Returns a support account to a citizen and ends its sessions. The API reads the role on every
 * request, so an impersonation the account started stops working with it.
 */
export async function revokeSupport(email: string): Promise<void> {
  await withTransaction(db, async (client) => {
    const { rows } = await client.query<{ id: string; role: string }>(
      'SELECT id, role FROM "user" WHERE email = $1 FOR UPDATE',
      [email.toLowerCase()],
    );
    const [account] = rows;
    if (account?.role !== PlatformRoles.SUPPORT) {
      throw new Error(`${email} no es una cuenta de soporte.`);
    }

    await client.query(`UPDATE "user" SET role = 'citizen' WHERE id = $1`, [account.id]);
    await client.query('DELETE FROM session WHERE "userId" = $1', [account.id]);
  });
}

async function collectSupportInput() {
  return await group(
    {
      name: () =>
        text({
          message: 'Nombre completo de la persona de soporte:',
          placeholder: 'Ejemplo: Ana Torres',
          validate: (value) => {
            if ((value ?? '').trim().length < MIN_NAME_LENGTH) {
              return `Escribe el nombre completo (mínimo ${MIN_NAME_LENGTH} caracteres).`;
            }
          },
        }),
      email: () =>
        text({
          message: 'Correo electrónico de la cuenta de soporte:',
          placeholder: 'Ejemplo: soporte@dominio.xyz',
          validate: (value) => {
            if (!EMAIL_REGEX.test(value ?? '')) {
              return 'Debes ingresar un correo electrónico válido.';
            }
          },
        }),
      password: () =>
        password({
          message: `Crea una contraseña segura (mínimo ${MIN_PASSWORD_LENGTH} caracteres):`,
          validate: (value) => {
            if ((value ?? '').length < MIN_PASSWORD_LENGTH) {
              return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
            }
          },
        }),
    },
    {
      onCancel: () => {
        cancel('Operación cancelada por el usuario.');
        process.exit(0);
      },
    },
  );
}

async function grant() {
  const input = await collectSupportInput();

  const creating = spinner();
  creating.start('Creando la cuenta de soporte...');
  await grantSupport(input);
  creating.stop('Cuenta de soporte creada.');

  note(
    `${color.green(`Correo: ${input.email}`)}\n${color.green(`Contraseña: ${input.password}`)}`,
    'Cuenta de soporte:',
  );
  outro(color.green('Configurado correctamente. Ya puedes iniciar sesión con esta cuenta.'));
}

async function revoke(email: string) {
  await revokeSupport(email);
  outro(color.green(`${email} ya no es una cuenta de soporte.`));
}

async function main() {
  intro(color.inverse(' @packages/database: cuenta de soporte de la plataforma '));

  try {
    const [flag, email] = process.argv.slice(2);
    if (flag === '--revoke' && email) {
      await revoke(email);
    } else {
      await grant();
    }
  } catch (error: unknown) {
    log.error(error instanceof Error ? error.message : String(error));
    outro(color.red('Proceso fallido.'));
    process.exit(1);
  } finally {
    await db.end();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
