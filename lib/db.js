import { neon } from '@neondatabase/serverless';

/**
 * Netlify inyecta NETLIFY_DATABASE_URL al enlazar Neon.
 * En local usa DATABASE_URL en .env (cadena de conexión de Neon).
 */
export function getConnectionString() {
  return (
    process.env.NETLIFY_DATABASE_URL ||
    process.env.DATABASE_URL ||
    ''
  );
}

export function createSql() {
  const url = getConnectionString();
  if (!url) return null;
  return neon(url);
}
