// biome-ignore-all lint/style/noProcessEnv: the preload sets the environment the scripts read at import.
import process from 'node:process';
import { afterAll } from 'bun:test';
import { startTestDatabase, testEnvironment } from './database.ts';

const database = await startTestDatabase();
Object.assign(process.env, testEnvironment(database.url));

afterAll(() => database.stop());
