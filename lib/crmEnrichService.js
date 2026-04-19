import { getCrmContact, setCrmEnrichment } from './crmRepo.js';
import { gatherWebContextForCrmContact } from './tavilySearch.js';
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

  let webCtx;
  try {
    webCtx = await gatherWebContextForCrmContact(contact);
  } catch (e) {
    if (e.code === 'NO_TAVILY') {
      return {
        ok: false,
        status: 400,
        payload: {
          error: {
            message:
              'Para consultar internet en el enriquecimiento, configura TAVILY_API_KEY en el servidor (.env local o variables Netlify). Registro: https://tavily.com'
          }
        }
      };
    }
    return {
      ok: false,
      status: 502,
      payload: { error: { message: `Búsqueda web: ${e.message}` } }
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

  const userPrompt = buildCrmEnrichUserPrompt(contact, webCtx);
  const hasSnippets = Boolean(
    webCtx?.markdownContext && String(webCtx.markdownContext).trim()
  );
  const system = getCrmEnrichSystemPrompt(hasSnippets);

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `Respuesta Anthropic ${upstream.status}`;
    return {
      ok: false,
      status: upstream.status,
      payload: { error: { message: msg }, details: data }
    };
  }

  const text = data?.content?.[0]?.text ?? '';
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

  const toStore = {
    ...enrichment,
    fuentes_web: (webCtx.sources || []).map((s) => ({
      title: s.title,
      url: s.url
    })),
    web_search_queries: webCtx.queriesUsed || []
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
        queries: webCtx.queriesUsed,
        sourcesCount: toStore.fuentes_web.length
      }
    }
  };
}
