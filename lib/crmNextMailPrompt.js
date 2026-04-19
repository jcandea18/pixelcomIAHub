import { PIXELCOM_OFFERING_SHORT_ES } from './pixelcomContext.js';

/** Alineado con OUTPUT_LANGS del cliente (index.html) */
export function inferOutputLangCodeFromPais(pais) {
  const p = String(pais || '').toLowerCase();
  if (/francia|france|\bfr\b/.test(p)) return 'frances';
  if (/reino unido|uk|brit|inglaterra|england|scotland|wales/.test(p)) return 'ingles';
  if (/usa|estados unidos|united states|\bus\b/.test(p)) return 'ingles';
  if (/belgica|belgium|belgique/.test(p)) return 'frances';
  if (/suiza|switzerland|schweiz/.test(p)) return 'aleman';
  if (/luxembourg|luxemburgo/.test(p)) return 'frances';
  if (/alemania|germany|deutschland/.test(p)) return 'aleman';
  if (/italia|italy|italie/.test(p)) return 'italiano';
  if (/portugal/.test(p)) return 'portugues';
  if (/holanda|netherlands|países bajos|nederland/.test(p)) return 'holandes';
  if (/españa|spain|espagne/.test(p)) return 'espanol';
  return 'espanol';
}

const LANG_LABEL = {
  frances: 'francés',
  ingles: 'inglés',
  espanol: 'español',
  aleman: 'alemán',
  italiano: 'italiano',
  portugues: 'portugués',
  holandes: 'neerlandés'
};

const SIGNATURE_HINT = {
  frances:
    "Signe toujours comme « L'équipe commerciale Pixelcom · www.pixelcom.es ».",
  ingles: 'Sign always as "The Pixelcom sales team · www.pixelcom.es".',
  espanol: 'Firma siempre como « El equipo comercial Pixelcom · www.pixelcom.es ».',
  aleman: 'Signiere immer als „Das Pixelcom Vertriebsteam · www.pixelcom.es“.',
  italiano: 'Firma sempre come « Il team commerciale Pixelcom · www.pixelcom.es ».',
  portugues:
    'Assine sempre como « A equipa comercial Pixelcom · www.pixelcom.es ».',
  holandes:
    'Sluit altijd af als „Het Pixelcom verkoopteam · www.pixelcom.es“.'
};

function enrichmentDigest(en) {
  if (!en || typeof en !== 'object') return '';
  const lines = [
    en.resumen_contacto && `Resumen: ${en.resumen_contacto}`,
    en.hipotesis_empresa && `Empresa (IA): ${en.hipotesis_empresa}`,
    en.encaje_pixelcom &&
      `Encaje Pixelcom: ${en.encaje_pixelcom} — ${en.razon_encaje || ''}`,
    Array.isArray(en.angulos_comerciales) &&
      en.angulos_comerciales.length &&
      `Ángulos: ${en.angulos_comerciales.slice(0, 4).join('; ')}`,
    en.siguiente_paso &&
      `Siguiente paso sugerido (IA): ${en.siguiente_paso}`
  ].filter(Boolean);
  return lines.join('\n');
}

export function buildCrmNextMailMessages(contact, brief, catalogShortOverride) {
  const langCode = inferOutputLangCodeFromPais(contact.pais);
  const idiomaLabel = LANG_LABEL[langCode] || 'español';
  const sig = SIGNATURE_HINT[langCode] || SIGNATURE_HINT.espanol;
  const encText = enrichmentDigest(contact.enrichment);

  const shortRef =
    typeof catalogShortOverride === 'string' && catalogShortOverride.trim()
      ? catalogShortOverride.trim()
      : PIXELCOM_OFFERING_SHORT_ES;

  const system = `Eres el asistente comercial de Pixelcom Ingeniería (España): cronometraje y señalización para karting (Pixeltiming) y circuitos (Pixelmotorsport). Modelo All-in-One: hardware + software + soporte.

Referencia de líneas y productos Pixelcom (usa solo lo pertinente al contacto): ${shortRef}

Tu tarea es redactar el PRÓXIMO correo de seguimiento hacia un contacto que YA ESTÁ en CRM (no es un primer cold email genérico). Debe avanzar la conversación: recordar valor, proponer un siguiente paso concreto (demo, llamada, envío de info) y tono profesional cercano.

Redacta TODO el correo en ${idiomaLabel}. ${sig}

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin texto antes ni después):
{"subject":"...","html":"<article>...</article>","text":"..."}

Reglas:
- subject: una línea.
- html: fragmento dentro de <article>...</article>, <p>, <ul><li>, <strong>. Sin script ni estilos.
- text: mismo contenido en texto plano con saltos de línea.`;

  const userParts = [
    'Genera el próximo mail de seguimiento para este cliente CRM:',
    '',
    `- nombre contacto: ${contact.nombre ?? ''}`,
    `- empresa: ${contact.empresa ?? ''}`,
    `- email: ${contact.email ?? ''}`,
    `- teléfono: ${contact.telefono ?? ''}`,
    `- país: ${contact.pais ?? ''}`,
    `- web: ${contact.web ?? ''}`,
    `- notas internas: ${contact.notas ?? ''}`,
    ''
  ];

  if (encText) {
    userParts.push('Contexto del enriquecimiento IA (úsalos con criterio, pueden ser inferencias):');
    userParts.push(encText);
    userParts.push('');
  }

  if (brief && String(brief).trim()) {
    userParts.push('Instrucciones adicionales del usuario para este correo:');
    userParts.push(String(brief).trim());
    userParts.push('');
  }

  userParts.push(
    `Máximo ~220 palabras en el cuerpo. Idioma de salida: ${idiomaLabel}.`
  );

  const user = userParts.join('\n');

  return { system, user, outputLanguage: langCode };
}
