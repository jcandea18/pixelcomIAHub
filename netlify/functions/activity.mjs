import { listGenerated } from '../../lib/generatedRepo.js';
import { listPipelineLeads } from '../../lib/pipelineRepo.js';
import { buildActivityFeed } from '../../lib/activityFeed.js';

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
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
        'access-control-max-age': '86400'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { error: { message: 'Método no permitido.' } });
  }

  try {
    const lim = event.queryStringParameters?.limit;
    const n = lim != null ? Number(lim) : 250;
    const cap = Math.min(Math.max(Number(n) || 250, 10), 500);
    let generated = [];
    let leads = [];
    try {
      generated = await listGenerated({ limit: n });
    } catch (e) {
      if (e.message === 'NO_DATABASE_URL') throw e;
    }
    try {
      leads = await listPipelineLeads();
    } catch (e) {
      if (e.message === 'NO_DATABASE_URL') throw e;
    }
    const items = buildActivityFeed(generated, leads).slice(0, cap);
    return json(200, { items });
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
