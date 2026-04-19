import {
  insertGenerated,
  listGenerated,
  getGeneratedById
} from '../../lib/generatedRepo.js';

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
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
        'access-control-max-age': '86400'
      },
      body: ''
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      const singleId = event.queryStringParameters?.id;
      if (singleId && String(singleId).trim()) {
        const item = await getGeneratedById(String(singleId).trim());
        if (!item) {
          return json(404, { error: { message: 'No encontrado.' } });
        }
        return json(200, { item });
      }
      const kind = event.queryStringParameters?.kind;
      const limit = event.queryStringParameters?.limit;
      const items = await listGenerated({
        kind: kind || undefined,
        limit: limit != null ? Number(limit) : undefined
      });
      return json(200, { items });
    }

    if (event.httpMethod === 'POST') {
      let payload;
      try {
        payload = JSON.parse(event.body || '{}');
      } catch {
        return json(400, { error: { message: 'JSON inválido.' } });
      }
      const {
        kind,
        outputLanguage,
        input,
        bodyHtml,
        bodyPlain,
        subject
      } = payload;
      if (!kind || !input || !bodyHtml) {
        return json(400, {
          error: { message: 'kind, input y bodyHtml son obligatorios.' }
        });
      }
      const entry = await insertGenerated({
        kind: String(kind),
        outputLanguage:
          outputLanguage != null ? String(outputLanguage) : null,
        input,
        bodyHtml: String(bodyHtml),
        bodyPlain: bodyPlain != null ? String(bodyPlain) : null,
        subject: subject != null ? String(subject) : null
      });
      return json(200, { entry });
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
    if (e.message === 'INVALID_KIND') {
      return json(400, {
        error: {
          message: 'kind debe ser newsletter, prospect_email o seo.'
        }
      });
    }
    if (e.message === 'INVALID_INPUT' || e.message === 'INVALID_BODY') {
      return json(400, { error: { message: 'Datos incompletos.' } });
    }
    return json(
      500,
      { error: { message: e?.message || 'Error al guardar.' } },
      { 'access-control-allow-origin': '*' }
    );
  }
}
