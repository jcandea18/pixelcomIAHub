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
    return json(405, { error: { message: 'Método no permitido' } });
  }

  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) {
    return json(500, {
      error: {
        message:
          'Falta WEBHOOK_URL en Netlify (Site settings → Environment variables).'
      }
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: { message: 'JSON inválido.' } });
  }

  const { to, subject, html, text } = payload;
  const emailOk = typeof to === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  if (!emailOk) {
    return json(400, { error: { message: 'El campo "to" debe ser un email válido.' } });
  }
  if (!subject || typeof subject !== 'string') {
    return json(400, { error: { message: 'Falta "subject".' } });
  }

  const forwardBody = JSON.stringify({
    to: to.trim(),
    subject: String(subject),
    html: typeof html === 'string' ? html : '',
    text: typeof text === 'string' ? text : ''
  });

  const headers = { 'content-type': 'application/json' };
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) headers['x-webhook-secret'] = secret;

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: forwardBody
    });
    const raw = await upstream.text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { raw };
    }
    if (!upstream.ok) {
      return json(502, {
        error: {
          message: `El webhook respondió ${upstream.status}.`,
          upstream: parsed
        }
      });
    }
    return json(200, { ok: true, upstream: parsed });
  } catch (e) {
    return json(500, {
      error: { message: e?.message || 'Error al llamar al webhook.' }
    });
  }
}
