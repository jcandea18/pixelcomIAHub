import { createSql } from './db.js';

export async function insertAppEvent(module, action, meta) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  if (meta == null) {
    await sql`
      INSERT INTO app_events (module, action, meta_json)
      VALUES (${module}, ${action}, NULL)
    `;
  } else {
    const metaStr = JSON.stringify(meta);
    await sql`
      INSERT INTO app_events (module, action, meta_json)
      VALUES (${module}, ${action}, ${metaStr}::jsonb)
    `;
  }
}
