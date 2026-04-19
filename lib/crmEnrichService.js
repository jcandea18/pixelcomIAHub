import { getCrmContact, setCrmEnrichment } from './crmRepo.js';
import {
  buildWebSearchToolDef,
  extractAssistantText,
  extractWebSourcesFromMessage
} from './anthropicWebSearch.js';
import {
  getCrmEnrichSystemPrompt,
  parseCrmEnrichResponse,
  buildCrmEnrichUserPrompt
} from './crmEnrichPrompt.js';

export async function runCrmEnrichment(contactId) {
  const contact = await getCrmContact(contactId);
  if (!contact) {
    return {
      ok: false,
      status: 404,
      payload: { error: { message: 'Contacto no encontrado.' } }
    };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return {
      ok: false,
      status: 500,
      payload: { error: { message: 'Falta ANTHROPIC_API_KEY en el servidor.' } }
    };
  }

  const userPrompt = buildCrmEnrichUserPrompt(contact);
  const system = getCrmEnrichSystemPrompt();

  const model =
    process.env.CRM_ENRICH_MODEL || 'claude-sonnet-4-20250514';
  const tool = buildWebSearchToolDef();

  const headers = {
    'content-type': 'application/json',
    'x-api-key': anthropicKey,
    'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01'
  };
  const beta = process.env.ANTHROPIC_BETA?.trim();
  if (beta) {
    headers['anthropic-beta'] = beta;
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 6144,
      system,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [tool]
    })
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Anthropic ${upstream.status}`;
    return {
      ok: false,
      status: upstream.status,
      payload: { error: { message: msg }, details: data }
    };
  }

  const text = extractAssistantText(data);
  if (!text) {
    return {
      ok: false,
      status: 502,
      payload: {
        error: {
          message:
            'Respuesta vacía del modelo (revisa modelo compatible con web_search y tipo de herramienta).',
          stopReason: data?.stop_reason,
          raw: data
        }
      }
    };
  }

  let enrichment;
  try {
    enrichment = parseCrmEnrichResponse(text);
  } catch (err) {
    return {
      ok: false,
      status: 502,
      payload: {
        error: {
          message: err?.message || 'No se pudo interpretar la respuesta.',
          rawText: text
        }
      }
    };
  }

  const fuentes = extractWebSourcesFromMessage(data);

  const toStore = {
    ...enrichment,
    fuentes_web: fuentes,
    web_search_provider: 'anthropic',
    web_search_tool: tool.type,
    web_search_queries: []
  };

  const entry = await setCrmEnrichment(contact.id, toStore);

  return {
    ok: true,
    status: 200,
    payload: {
      entry,
      enrichment: toStore,
      webSearch: {
        used: true,
        provider: 'anthropic',
        tool: tool.type,
        sourcesCount: fuentes.length,
        stopReason: data?.stop_reason
      }
    }
  };
}
