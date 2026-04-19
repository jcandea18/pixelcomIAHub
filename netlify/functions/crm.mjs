import {
  listCrmContacts,
  insertCrmContact,
  updateCrmContact,
  deleteCrmContact
} from '../../lib/crmRepo.js';

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
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
        'access-control-max-age': '86400'
      },
      body: ''
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      const contacts = await listCrmContacts();
      return json(200, { contacts });
    }

    if (event.httpMethod === 'POST') {
      let payload;
      try {
        payload = JSON.parse(event.body || '{}');
      } catch {
        return json(400, { error: { message: 'JSON inválido.' } });
      }
      const entry = await insertCrmContact({
        nombre: payload.nombre,
        empresa: payload.empresa,
        email: payload.email,
        telefono: payload.telefono,
        pais: payload.pais,
        web: payload.web,
        notas: payload.notas
      });
      return json(200, { entry });
    }

    if (event.httpMethod === 'PUT') {
      let payload;
      try {
        payload = JSON.parse(event.body || '{}');
      } catch {
        return json(400, { error: { message: 'JSON inválido.' } });
      }
      if (!payload.id) {
        return json(400, { error: { message: 'Falta id.' } });
      }
      const entry = await updateCrmContact(String(payload.id), {
        nombre: payload.nombre,
        empresa: payload.empresa,
        email: payload.email,
        telefono: payload.telefono,
        pais: payload.pais,
        web: payload.web,
        notas: payload.notas
      });
      if (!entry) {
        return json(404, { error: { message: 'No encontrado.' } });
      }
      return json(200, { entry });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return json(400, { error: { message: 'Falta query id.' } });
      }
      await deleteCrmContact(id);
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
    if (e.message === 'INVALID_CRM_FIELDS') {
      return json(
        400,
        { error: { message: 'nombre y empresa son obligatorios.' } },
        { 'access-control-allow-origin': '*' }
      );
    }
    return json(
      500,
      { error: { message: e?.message || 'Error CRM.' } },
      { 'access-control-allow-origin': '*' }
    );
  }
}
