import { getCrmContact } from './crmRepo.js';
import { buildCrmNextMailMessages } from './crmNextMailPrompt.js';

export async function runCrmNextMail({ id, brief, catalogShort }) {
  const contact = await getCrmContact(id);
  if (!contact) {
    return {
      ok: false,
      status: 404,
      payload: { error: { message: 'Contacto no encontrado.' } }
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      payload: {
        error: { message: 'Falta ANTHROPIC_API_KEY en el servidor.' }
      }
    };
  }

  const { system, user, outputLanguage } = buildCrmNextMailMessages(
    contact,
    brief,
    catalogShort
  );

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
      system,
      messages: [{ role: 'user', content: user }]
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

  const text = data?.content?.[0]?.text ?? '';
  if (!text.trim()) {
    return {
      ok: false,
      status: 502,
      payload: { error: { message: 'Respuesta vacía del modelo.' } }
    };
  }

  return {
    ok: true,
    status: 200,
    payload: {
      text,
      outputLanguage,
      crmContactId: contact.id
    }
  };
}
