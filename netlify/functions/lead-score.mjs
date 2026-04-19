import {
  buildLeadScoringSystemPrompt,
  parseLeadScoreResponse
} from '../../lib/leadScoringPrompt.js';

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

function buildLeadScoreUserPrompt(lead) {
  const lines = [
    'Score this B2B lead for Pixelcom Ingeniería using the engine rules. Output JSON only as specified in the system message.',
    '',
    'Lead data:',
    `- nombre: ${lead?.nombre ?? ''}`,
    `- empresa: ${lead?.empresa ?? ''}`,
    `- pais: ${lead?.pais ?? ''}`,
    `- tipo: ${lead?.tipo ?? ''}`,
    `- producto: ${lead?.producto ?? ''}`,
    `- canal: ${lead?.canal ?? ''}`,
    `- urgencia: ${lead?.urgencia ?? ''}`,
    `- presupuesto: ${lead?.presupuesto ?? ''}`,
    `- cliente_existente: ${lead?.cliente_existente ?? ''}`,
    `- notas: ${lead?.notas ?? ''}`,
    `- senales_negativas: ${Array.isArray(lead?.senales_negativas) ? lead.senales_negativas.join(', ') : ''}`,
    '',
    'If prior demo request is not stated in the data, assume false (no +10). Apply negative signal penalties only for the negative items explicitly listed in senales_negativas.'
  ];
  return lines.join('\n');
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
      error: { message: 'Falta ANTHROPIC_API_KEY en Netlify.' }
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: { message: 'JSON inválido.' } });
  }

  const lead = payload?.lead;
  if (!lead || typeof lead !== 'object') {
    return json(400, { error: { message: 'Falta objeto "lead".' } });
  }

  const userPrompt = buildLeadScoreUserPrompt(lead);
  const systemPrompt = buildLeadScoringSystemPrompt(
    typeof payload?.catalogShort === 'string' ? payload.catalogShort : ''
  );

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return json(upstream.status, data, { 'access-control-allow-origin': '*' });
    }

    const text = data?.content?.[0]?.text ?? '';
    try {
      const result = parseLeadScoreResponse(text);
      return json(200, { result, rawText: text }, { 'access-control-allow-origin': '*' });
    } catch (e) {
      return json(
        502,
        {
          error: {
            message: e?.message || 'No se pudo interpretar el JSON del modelo.',
            rawText: text
          }
        },
        { 'access-control-allow-origin': '*' }
      );
    }
  } catch (e) {
    return json(
      500,
      { error: { message: e?.message || 'Error inesperado.' } },
      { 'access-control-allow-origin': '*' }
    );
  }
}
