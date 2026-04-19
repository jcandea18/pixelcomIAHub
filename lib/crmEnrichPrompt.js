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

The disclaimer must clarify what came from live web search vs inference, and that critical facts require verification before decisions.`;

export function getCrmEnrichSystemPrompt() {
  return `${CRM_ENRICH_SYSTEM_PROMPT_BASE}

You have access to the web_search tool on this API request. Before filling the JSON, search the web for recent public information about the company and contact (official site, sector pages, credible news). Combine findings with the Pixelcom catalog in the user message; resolve conflicts in datos_a_verificar and riesgos_dudas.`;
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

export function buildCrmEnrichUserPrompt(contact, catalogFullOverride) {
  const catalog =
    typeof catalogFullOverride === 'string' && catalogFullOverride.trim()
      ? catalogFullOverride.trim()
      : PIXELCOM_OFFERING_FULL_ES;

  const lines = [
    'Enriquece este contacto CRM. Usa web_search para encontrar información pública reciente y fiable sobre la empresa (y, si aplica, el rol del contacto).',
    'Devuelve ÚNICAMENTE el JSON del esquema indicado en el system prompt. Sin texto extra.',
    '',
    'Datos CRM:',
    `- nombre: ${contact.nombre ?? ''}`,
    `- empresa: ${contact.empresa ?? ''}`,
    `- email: ${contact.email ?? ''}`,
    `- telefono: ${contact.telefono ?? ''}`,
    `- pais: ${contact.pais ?? ''}`,
    `- web: ${contact.web ?? ''}`,
    `- notas internas: ${contact.notas ?? ''}`,
    '',
    'Referencia Pixelcom (catálogo real; úsalo para evaluar encaje y proponer siguiente paso):',
    catalog
  ];

  return lines.join('\n');
}
