import { cancel, group, intro, log, note, outro, password, spinner, text } from '@clack/prompts';
import { createId } from '@paralleldrive/cuid2';
import { Pool } from 'pg';
import color from 'picocolors';
import { createAppAuth, deleteUnusedUser, insertMember, withTransaction } from '../src/auth/index.ts';
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
  baseURL: optionalEnv('BETTER_AUTH_URL', 'http://localhost:4000/api'),
});

export async function checkExistingOrganization(): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM "organization" LIMIT 1`);
  return rows.length > 0;
}

async function collectUserInput() {
  return await group(
    {
      name: () =>
        text({
          message: 'Nombre completo del propietario:',
          placeholder: 'Ejemplo: Juan Pérez',
          validate: (value) => {
            if ((value ?? '').trim().length < MIN_NAME_LENGTH) {
              return `Escribe el nombre completo (mínimo ${MIN_NAME_LENGTH} caracteres).`;
            }
          },
        }),
      email: () =>
        text({
          message: 'Correo electrónico del propietario:',
          placeholder: 'Ejemplo: admin@dominio.xyz',
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

/**
 * Creates the owner through the admin plugin's `createUser`, not `signUpEmail`, so `user.role`
 * lands on `'owner'` (an `AppRole`) instead of the default `'user'`. The organization and its
 * owner membership are then written directly, in one transaction, rather than through Better
 * Auth's `createOrganization`: that endpoint runs on Better Auth's own connection, which cannot
 * join a transaction held open on `db`, and the two rows must land together or not at all, the
 * same way `insertMember` writes a staff member's row (see ARCHITECTURE.md).
 */
export async function bootstrapOwner(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ userId: string; organizationId: string }> {
  const { user } = await auth.api.createUser({
    body: { name: input.name, email: input.email, password: input.password, role: 'owner' },
  });

  try {
    const organizationId = createId();
    await withTransaction(db, async (client) => {
      await client.query('INSERT INTO organization (id, name, slug) VALUES ($1, $2, $3)', [
        organizationId,
        'Lima Limpia',
        'lima-limpia',
      ]);
      await insertMember(client, { userId: user.id, organizationId, role: 'owner' });
    });

    return { userId: user.id, organizationId };
  } catch (error) {
    await deleteUnusedUser(db, user.id);
    throw error;
  }
}

function displaySuccessMessage(email: string, userPassword: string) {
  const noteMessage = `
${color.green(`Correo: ${email}`)}
${color.green(`Contraseña: ${userPassword}`)}
`;
  note(noteMessage, 'Propietario de la organización:');
  outro(color.green('Configurado correctamente. Ya puedes iniciar sesión con esta cuenta.'));
}

function handleError(error: unknown) {
  log.error('No se pudo configurar la organización y el propietario.');

  if (error instanceof Error) {
    if (error.message.includes('unique constraint')) {
      log.warn('Ya existe un usuario con este correo electrónico en la base de datos.');
    } else {
      log.error(error.message);
    }
  }

  outro(color.red('Proceso fallido.'));
  process.exit(1);
}

async function main() {
  intro(color.inverse(' @packages/database: creación de organización y propietario '));

  try {
    const s = spinner();
    s.start('Revisando si ya existe una organización...');
    const hasOrganization = await checkExistingOrganization();
    s.stop('Revisión completada.');

    if (hasOrganization) {
      log.warn('Ya existe una organización.');
      outro('Este script solo puede crear la primera organización y su propietario.');
      return;
    }

    const userInput = await collectUserInput();

    const creating = spinner();
    creating.start('Creando usuario propietario y organización principal...');
    await bootstrapOwner(userInput);
    creating.stop('Propietario y organización creados.');

    displaySuccessMessage(userInput.email, userInput.password);
  } catch (error: unknown) {
    handleError(error);
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
