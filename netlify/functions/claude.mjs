const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders
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
    return json(405, { error: { message: 'Método no permitido' } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: { message: 'Falta ANTHROPIC_API_KEY en Netlify (Site settings → Environment variables).' }
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: { message: 'JSON inválido en el cuerpo de la petición.' } });
  }

  const { systemPrompt, userPrompt } = payload;
  if (!systemPrompt || !userPrompt) {
    return json(400, {
      error: { message: 'systemPrompt y userPrompt son obligatorios.' }
    });
  }

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return json(upstream.status, data, { 'access-control-allow-origin': '*' });
    }

    return json(
      200,
      { text: data?.content?.[0]?.text ?? '' },
      { 'access-control-allow-origin': '*' }
    );
  } catch (e) {
    return json(
      500,
      { error: { message: e?.message || 'Error inesperado en el proxy.' } },
      { 'access-control-allow-origin': '*' }
    );
  }
}
