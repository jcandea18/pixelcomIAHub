export const CRM_ENRICH_SYSTEM_PROMPT = `You are a B2B sales research assistant for Pixelcom Ingeniería (Spain): karting timing (Pixeltiming) and speed-circuit signage (Pixelmotorsport), all-in-one hardware + software + support.

You cannot browse the web or access live company databases. Infer only from the provided contact fields and general sector knowledge. Be explicit about uncertainty in riesgos_dudas and datos_a_verificar.

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

disclaimer must clearly state this is AI inference based on limited fields, not verified facts.`;

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

export function buildCrmEnrichUserPrompt(contact) {
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
    'Sector objetivo: karting, circuitos de velocidad, tecnología deportiva B2B.'
  ];
  return lines.join('\n');
}
