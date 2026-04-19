import { runCrmNextMail } from '../../lib/crmNextMailService.js';

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

  if (!payload.id || typeof payload.id !== 'string' || !String(payload.id).trim()) {
    return json(400, { error: { message: 'Falta id del contacto.' } });
  }

  try {
    const result = await runCrmNextMail({
      id: String(payload.id).trim(),
      brief: typeof payload.brief === 'string' ? payload.brief : ''
    });
    if (!result.ok) {
      return json(
        result.status,
        result.payload,
        { 'access-control-allow-origin': '*' }
      );
    }
    return json(200, result.payload);
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
      { error: { message: e?.message || 'Error.' } },
      { 'access-control-allow-origin': '*' }
    );
  }
}
