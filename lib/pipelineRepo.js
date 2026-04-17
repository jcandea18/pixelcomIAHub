import { createSql } from './db.js';

function mapRow(row) {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).getTime(),
    nombre: row.nombre,
    empresa: row.empresa,
    lead:
      typeof row.lead_json === 'string'
        ? JSON.parse(row.lead_json)
        : row.lead_json,
    result:
      typeof row.result_json === 'string'
        ? JSON.parse(row.result_json)
        : row.result_json
  };
}

export async function listPipelineLeads() {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  const rows = await sql`
    SELECT id, created_at, nombre, empresa, lead_json, result_json
    FROM pipeline_leads
    ORDER BY created_at DESC
  `;
  return rows.map(mapRow);
}

export async function insertPipelineLead({ nombre, empresa, lead, result }) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  const payload = JSON.stringify(lead);
  const scorePayload = JSON.stringify(result);
  const inserted = await sql`
    INSERT INTO pipeline_leads (nombre, empresa, lead_json, result_json)
    VALUES (
      ${nombre},
      ${empresa},
      ${payload}::jsonb,
      ${scorePayload}::jsonb
    )
    RETURNING id, created_at, nombre, empresa, lead_json, result_json
  `;
  return mapRow(inserted[0]);
}

export async function deletePipelineLead(id) {
  const sql = createSql();
  if (!sql) throw new Error('NO_DATABASE_URL');
  await sql`DELETE FROM pipeline_leads WHERE id = ${id}::uuid`;
}
