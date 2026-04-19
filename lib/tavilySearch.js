const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

async function tavilySearchOnce(apiKey, query) {
  const res = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: 6,
      include_answer: true
    })
  });
  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Tavily respuesta no JSON (${res.status})`);
  }
  if (!res.ok) {
    const msg = data?.error || rawText.slice(0, 220);
    throw new Error(`Tavily ${res.status}: ${msg}`);
  }
  return data;
}

/**
 * Ejecuta búsquedas Tavily y devuelve texto para el prompt + fuentes enlazables.
 * Requiere process.env.TAVILY_API_KEY
 */
export async function gatherWebContextForCrmContact(contact) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    const e = new Error('NO_TAVILY');
    e.code = 'NO_TAVILY';
    throw e;
  }

  const empresa = (contact.empresa || '').trim();
  const nombre = (contact.nombre || '').trim();
  const pais = (contact.pais || '').trim();
  const web = (contact.web || '').trim();

  const queries = [];
  if (web) {
    try {
      const host = new URL(web.startsWith('http') ? web : `https://${web}`)
        .hostname.replace(/^www\./, '');
      if (host && empresa) queries.push(`${empresa} ${host}`);
    } catch (_) {
      /* ignorar URL inválida */
    }
  }
  if (empresa) {
    queries.push(`${empresa} ${pais}`.trim());
    queries.push(`${empresa} karting OR circuit OR motorsport OR timing`);
  }
  if (nombre && empresa) {
    queries.push(`"${nombre}" ${empresa}`);
  }
  if (queries.length === 0) {
    queries.push(`${nombre || 'contacto'} ${empresa || ''}`.trim() || 'empresa contacto B2B');
  }

  const seenUrls = new Set();
  const chunks = [];
  const sources = [];
  let motorAnswer = '';

  for (const query of queries.slice(0, 3)) {
    const data = await tavilySearchOnce(apiKey, query);
    if (data?.answer && !motorAnswer) {
      motorAnswer = String(data.answer).trim();
    }
    const results = Array.isArray(data?.results) ? data.results : [];
    for (const r of results) {
      const url = r.url || r.href;
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      sources.push({
        title: r.title || '(sin título)',
        url,
        snippet: (r.content || '').slice(0, 900)
      });
      chunks.push(
        `### ${r.title || 'Resultado'}\nURL: ${url}\n${(r.content || '').trim()}`
      );
      if (chunks.length >= 14) break;
    }
    if (chunks.length >= 14) break;
  }

  let markdownContext = '';
  if (motorAnswer) {
    markdownContext += `Resumen automático del buscador: ${motorAnswer}\n\n---\n\n`;
  }
  markdownContext += chunks.length
    ? chunks.join('\n\n---\n\n')
    : '(No se obtuvieron fragmentos indexados; indícalo en resumen y datos_a_verificar.)';

  return {
    used: true,
    markdownContext,
    sources,
    queriesUsed: queries.slice(0, 3)
  };
}
