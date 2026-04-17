import {
  listPipelineLeads,
  insertPipelineLead,
  deletePipelineLead
} from '../../lib/pipelineRepo.js';

function json(statusCode, body, extra = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      ...extra
    },
    body: JSON.stringify(body)
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
        'access-control-max-age': '86400'
      },
      body: ''
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      const leads = await listPipelineLeads();
      return json(200, { leads });
    }

    if (event.httpMethod === 'POST') {
      let payload;
      try {
        payload = JSON.parse(event.body || '{}');
      } catch {
        return json(400, { error: { message: 'JSON inválido.' } });
      }
      const { nombre, empresa, lead, result } = payload;
      if (!nombre || !empresa || !lead || !result) {
        return json(400, {
          error: {
            message: 'nombre, empresa, lead y result son obligatorios.'
          }
        });
      }
      const entry = await insertPipelineLead({
        nombre: String(nombre),
        empresa: String(empresa),
        lead,
        result
      });
      return json(200, { entry });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return json(400, { error: { message: 'Falta query id.' } });
      }
      await deletePipelineLead(id);
      return json(200, { ok: true });
    }

    return json(405, { error: { message: 'Método no permitido.' } });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return json(
        503,
        {
          error: {
            message:
              'Base de datos no configurada en Netlify (NETLIFY_DATABASE_URL).'
          }
        },
        { 'access-control-allow-origin': '*' }
      );
    }
    return json(
      500,
      { error: { message: e?.message || 'Error en pipeline.' } },
      { 'access-control-allow-origin': '*' }
    );
  }
}
