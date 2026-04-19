/**
 * Background function: el enriquecimiento con web_search puede superar el timeout
 * de las funciones síncronas en Netlify (~10–26 s), lo que provoca 504.
 * Las Background Functions pueden ejecutar hasta ~15 min; el cliente recibe 202 al instante
 * y debe hacer polling en GET /api/crm hasta que cambie enrichedAt.
 */
import { runCrmEnrichment } from '../../lib/crmEnrichService.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
  'access-control-max-age': '86400'
};

function jsonRes(status, bodyObj) {
  return new Response(JSON.stringify(bodyObj), {
    status,
    headers: {
      ...CORS,
      'content-type': 'application/json; charset=utf-8'
    }
  });
}

export default async function crmEnrichBackgroundHandler(request) {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS });
  }

  if (request.method !== 'POST') {
    return jsonRes(405, { error: { message: 'Método no permitido.' } });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonRes(400, { error: { message: 'JSON inválido.' } });
  }

  const id = payload?.id;
  if (!id || typeof id !== 'string') {
    return jsonRes(400, { error: { message: 'Falta id del contacto.' } });
  }

  try {
    const result = await runCrmEnrichment(id.trim());
    if (!result.ok) {
      console.error(
        'crm-enrich-background upstream error',
        result.status,
        JSON.stringify(result.payload ?? {}).slice(0, 500)
      );
    }
  } catch (e) {
    console.error('crm-enrich-background', e);
  }

  return new Response(null, { status: 202, headers: CORS });
}
