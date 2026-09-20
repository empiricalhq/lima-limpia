// biome-ignore-all lint/style/noProcessEnv: this module is the centralized env access point.
import process from 'node:process';

export function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`La variable de entorno ${name} es obligatoria`);
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}
