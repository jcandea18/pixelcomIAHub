import { createSql } from './db.js';

function mapRow(row) {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    nombre: row.nombre,
    empresa: row.empresa,
    email: row.email,
    telefono: row.telefono,
    pais: row.pais,
    web: row.web,
    notas: row.notas,
    enrichment:
      row.enrichment_json == null
        ? null
        : typeof row.enrichment_json === 'string'
          ? JSON.parse(row.enrichment_json)
          : row.enrichment_json,
    enrichedAt: row.enriched_at
      ? new Date(row.enriched_at).getTime()
      : null
  };
}

export async function listCrmContacts({ limit = 300 } = {}) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  const lim = Math.min(Math.max(Number(limit) || 300, 1), 500);
  const rows = await sql`
    SELECT id, created_at, updated_at, nombre, empresa, email, telefono, pais, web, notas,
           enrichment_json, enriched_at
    FROM crm_contacts
    ORDER BY updated_at DESC
    LIMIT ${lim}
  `;
  return rows.map(mapRow);
}

export async function getCrmContact(id) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  const rows = await sql`
    SELECT id, created_at, updated_at, nombre, empresa, email, telefono, pais, web, notas,
           enrichment_json, enriched_at
    FROM crm_contacts
    WHERE id = ${id}::uuid
    LIMIT 1
  `;
  if (!rows.length) return null;
  return mapRow(rows[0]);
}

export async function insertCrmContact({
  nombre,
  empresa,
  email,
  telefono,
  pais,
  web,
  notas
}) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  if (!nombre?.trim() || !empresa?.trim()) {
    throw new Error('INVALID_CRM_FIELDS');
  }
  const inserted = await sql`
    INSERT INTO crm_contacts (nombre, empresa, email, telefono, pais, web, notas)
    VALUES (
      ${nombre.trim()},
      ${empresa.trim()},
      ${email?.trim() || null},
      ${telefono?.trim() || null},
      ${pais?.trim() || null},
      ${web?.trim() || null},
      ${notas?.trim() || null}
    )
    RETURNING id, created_at, updated_at, nombre, empresa, email, telefono, pais, web, notas,
              enrichment_json, enriched_at
  `;
  return mapRow(inserted[0]);
}

export async function updateCrmContact(
  id,
  { nombre, empresa, email, telefono, pais, web, notas }
) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  const existing = await getCrmContact(id);
  if (!existing) return null;
  const n = nombre != null ? String(nombre).trim() : existing.nombre;
  const e = empresa != null ? String(empresa).trim() : existing.empresa;
  if (!n || !e) throw new Error('INVALID_CRM_FIELDS');
  const updated = await sql`
    UPDATE crm_contacts SET
      nombre = ${n},
      empresa = ${e},
      email = ${email != null ? String(email).trim() || null : existing.email},
      telefono = ${telefono != null ? String(telefono).trim() || null : existing.telefono},
      pais = ${pais != null ? String(pais).trim() || null : existing.pais},
      web = ${web != null ? String(web).trim() || null : existing.web},
      notas = ${notas != null ? String(notas).trim() || null : existing.notas},
      updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING id, created_at, updated_at, nombre, empresa, email, telefono, pais, web, notas,
              enrichment_json, enriched_at
  `;
  return mapRow(updated[0]);
}

export async function setCrmEnrichment(id, enrichmentObj) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  const payload = JSON.stringify(enrichmentObj);
  const updated = await sql`
    UPDATE crm_contacts SET
      enrichment_json = ${payload}::jsonb,
      enriched_at = now(),
      updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING id, created_at, updated_at, nombre, empresa, email, telefono, pais, web, notas,
              enrichment_json, enriched_at
  `;
  if (!updated.length) return null;
  return mapRow(updated[0]);
}

export async function deleteCrmContact(id) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  await sql`DELETE FROM crm_contacts WHERE id = ${id}::uuid`;
}
