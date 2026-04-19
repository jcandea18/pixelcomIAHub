import {
  getCrmContact,
  setCrmEnrichment
} from '../../lib/crmRepo.js';
import {
  CRM_ENRICH_SYSTEM_PROMPT,
  parseCrmEnrichResponse,
  buildCrmEnrichUserPrompt
} from '../../lib/crmEnrichPrompt.js';

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

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return json(500, { error: { message: 'Falta ANTHROPIC_API_KEY.' } });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: { message: 'JSON inválido.' } });
  }

  const id = payload.id;
  if (!id || typeof id !== 'string') {
    return json(400, { error: { message: 'Falta id del contacto.' } });
  }

  try {
    const contact = await getCrmContact(id.trim());
    if (!contact) {
      return json(404, { error: { message: 'Contacto no encontrado.' } });
    }

    const userPrompt = buildCrmEnrichUserPrompt(contact);
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: CRM_ENRICH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return json(upstream.status, data);
    }

    const text = data?.content?.[0]?.text ?? '';
    let enrichment;
    try {
      enrichment = parseCrmEnrichResponse(text);
    } catch (err) {
      return json(502, {
        error: {
          message: err?.message || 'No se pudo interpretar la respuesta.',
          rawText: text
        }
      });
    }

    const entry = await setCrmEnrichment(contact.id, enrichment);
    return json(200, { entry, enrichment });
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
