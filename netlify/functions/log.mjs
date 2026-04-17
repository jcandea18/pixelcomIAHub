import { insertAppEvent } from '../../lib/eventsRepo.js';

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
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
        'access-control-max-age': '86400'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: { message: 'Método no permitido.' } });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: { message: 'JSON inválido.' } });
  }

  const { module, action, meta } = payload;
  if (!module || !action) {
    return json(400, {
      error: { message: 'module y action son obligatorios.' }
    });
  }

  try {
    await insertAppEvent(String(module), String(action), meta);
    return json(200, { ok: true }, { 'access-control-allow-origin': '*' });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return json(
        503,
        {
          error: {
            message:
              'Base de datos no configurada (NETLIFY_DATABASE_URL).'
          }
        },
        { 'access-control-allow-origin': '*' }
      );
    }
    return json(
      500,
      { error: { message: e?.message || 'Error al registrar evento.' } },
      { 'access-control-allow-origin': '*' }
    );
  }
}
