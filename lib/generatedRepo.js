import { createSql } from './db.js';

const ALLOWED_KINDS = new Set(['newsletter', 'prospect_email', 'seo']);

function mapRow(row) {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).getTime(),
    kind: row.kind,
    outputLanguage: row.output_language,
    input:
      typeof row.input_json === 'string'
        ? JSON.parse(row.input_json)
        : row.input_json,
    bodyHtml: row.body_html,
    bodyPlain: row.body_plain,
    subject: row.subject
  };
}

export async function insertGenerated({
  kind,
  outputLanguage,
  input,
  bodyHtml,
  bodyPlain,
  subject
}) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  if (!ALLOWED_KINDS.has(kind)) {
    throw new Error('INVALID_KIND');
  }
  if (!input || typeof input !== 'object') {
    throw new Error('INVALID_INPUT');
  }
  if (!bodyHtml || typeof bodyHtml !== 'string') {
    throw new Error('INVALID_BODY');
  }
  const inputStr = JSON.stringify(input);
  const inserted = await sql`
    INSERT INTO generated_contents (
      kind,
      output_language,
      input_json,
      body_html,
      body_plain,
      subject
    )
    VALUES (
      ${kind},
      ${outputLanguage ?? null},
      ${inputStr}::jsonb,
      ${bodyHtml},
      ${bodyPlain ?? null},
      ${subject ?? null}
    )
    RETURNING id, created_at, kind, output_language, input_json, body_html, body_plain, subject
  `;
  return mapRow(inserted[0]);
}

export async function listGenerated({ kind, limit = 200 }) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  if (kind && !ALLOWED_KINDS.has(kind)) {
    throw new Error('INVALID_KIND');
  }
  const rows = kind
    ? await sql`
        SELECT id, created_at, kind, output_language, input_json, body_html, body_plain, subject
        FROM generated_contents
        WHERE kind = ${kind}
        ORDER BY created_at DESC
        LIMIT ${lim}
      `
    : await sql`
        SELECT id, created_at, kind, output_language, input_json, body_html, body_plain, subject
        FROM generated_contents
        ORDER BY created_at DESC
        LIMIT ${lim}
      `;
  return rows.map(mapRow);
}

export async function getGeneratedById(id) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  const rows = await sql`
    SELECT id, created_at, kind, output_language, input_json, body_html, body_plain, subject
    FROM generated_contents
    WHERE id = ${id}::uuid
    LIMIT 1
  `;
  if (!rows.length) return null;
  return mapRow(rows[0]);
}

export async function updateGeneratedById(id, patch) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  const existing = await getGeneratedById(id);
  if (!existing) return null;

  const nextHtml =
    patch.bodyHtml !== undefined ? String(patch.bodyHtml) : existing.bodyHtml;
  const nextPlain =
    patch.bodyPlain !== undefined
      ? patch.bodyPlain === null
        ? null
        : String(patch.bodyPlain)
      : existing.bodyPlain;
  const nextSubject =
    patch.subject !== undefined
      ? patch.subject === null
        ? null
        : String(patch.subject)
      : existing.subject;

  const rows = await sql`
    UPDATE generated_contents
    SET
      body_html = ${nextHtml},
      body_plain = ${nextPlain},
      subject = ${nextSubject}
    WHERE id = ${id}::uuid
    RETURNING id, created_at, kind, output_language, input_json, body_html, body_plain, subject
  `;
  if (!rows.length) return null;
  return mapRow(rows[0]);
}
