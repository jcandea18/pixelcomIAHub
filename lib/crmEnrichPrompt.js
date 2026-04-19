import { PIXELCOM_OFFERING_FULL_ES } from './pixelcomContext.js';

export const CRM_ENRICH_SYSTEM_PROMPT_BASE = `You are a B2B sales research assistant for Pixelcom Ingeniería (Spain): karting timing (Pixeltiming) and speed-circuit signage (Pixelmotorsport), all-in-one hardware + software + support.

Respond with ONE JSON object only — no markdown fences, no text before or after. All human-readable strings in Spanish.

Shape (all keys required):
{
  "resumen_contacto": string,
  "hipotesis_empresa": string,
  "hipotesis_rol": string,
  "encaje_pixelcom": "alto" | "medio" | "bajo",
  "razon_encaje": string,
  "angulos_comerciales": string[],
  "preguntas_descubrimiento": string[],
  "riesgos_dudas": string[],
  "siguiente_paso": string,
  "datos_a_verificar": string[],
  "disclaimer": string
}

The disclaimer must clarify how much relies on web snippets vs inference and that critical facts require verification before decisions.`;

export function getCrmEnrichSystemPrompt(hasWebSnippets) {
  const webRule = hasWebSnippets
    ? `The user message includes a section "RESULTADOS DE BÚSQUEDA WEB (Tavily)" with recent indexed snippets. Use them as the main source for public facts about the company or person when relevant. Snippets may be incomplete, biased, outdated, or wrong — reflect conflicts and gaps in datos_a_verificar and riesgos_dudas.`
    : `No web search section is included; rely only on contact fields and cautious sector inference, and say so in the disclaimer.`;
  return `${CRM_ENRICH_SYSTEM_PROMPT_BASE}\n\n${webRule}`;
}

export function parseCrmEnrichResponse(raw) {
  const t = String(raw || '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('No JSON en la respuesta del modelo.');
  }
  const slice = t.slice(start, end + 1);
  let j;
  try {
    j = JSON.parse(slice);
  } catch {
    throw new Error('JSON inválido del modelo.');
  }
  const need = [
    'resumen_contacto',
    'hipotesis_empresa',
    'encaje_pixelcom',
    'siguiente_paso',
    'disclaimer'
  ];
  for (const k of need) {
    if (j[k] == null || j[k] === '') {
      throw new Error(`Falta campo obligatorio en JSON: ${k}`);
    }
  }
  const enc = j.encaje_pixelcom;
  if (!['alto', 'medio', 'bajo'].includes(enc)) {
    j.encaje_pixelcom = 'medio';
  }
  return j;
}

export function buildCrmEnrichUserPrompt(contact, webCtx = null) {
  const lines = [
    'Genera el JSON de enriquecimiento para este contacto CRM:',
    '',
    `- nombre: ${contact.nombre ?? ''}`,
    `- empresa: ${contact.empresa ?? ''}`,
    `- email: ${contact.email ?? ''}`,
    `- telefono: ${contact.telefono ?? ''}`,
    `- pais: ${contact.pais ?? ''}`,
    `- web: ${contact.web ?? ''}`,
    `- notas internas: ${contact.notas ?? ''}`,
    '',
    'Sector objetivo: karting, circuitos de velocidad, tecnología deportiva B2B, videomarcadores e instalaciones deportivas.',
    '',
    '---',
    'Catálogo de referencia Pixelcom (líneas reales de producto y servicio):',
    '',
    PIXELCOM_OFFERING_FULL_ES
  ];

  if (webCtx?.used && webCtx.markdownContext) {
    lines.push(
      '',
      '---',
      'RESULTADOS DE BÚSQUEDA WEB (Tavily) — uso para datos públicos recientes; verifica contradicciones:',
      '',
      webCtx.markdownContext
    );
  }

  return lines.join('\n');
}
