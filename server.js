import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  LEAD_SCORING_SYSTEM_PROMPT,
  parseLeadScoreResponse
} from './lib/leadScoringPrompt.js';
import {
  listPipelineLeads,
  insertPipelineLead,
  deletePipelineLead
} from './lib/pipelineRepo.js';
import { insertAppEvent } from './lib/eventsRepo.js';
import {
  insertGenerated,
  listGenerated,
  getGeneratedById,
  updateGeneratedById
} from './lib/generatedRepo.js';
import { buildActivityFeed } from './lib/activityFeed.js';
import {
  listCrmContacts,
  insertCrmContact,
  updateCrmContact,
  deleteCrmContact
} from './lib/crmRepo.js';
import { runCrmEnrichment } from './lib/crmEnrichService.js';
import { runCrmNextMail } from './lib/crmNextMailService.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS', 'DELETE'],
    allowedHeaders: ['Content-Type']
  })
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

app.post('/api/webhook-email', async (req, res) => {
  try {
    if (!WEBHOOK_URL) {
      return res.status(500).json({
        error: {
          message:
            'Falta WEBHOOK_URL en el entorno (.env local o variables de Netlify).'
        }
      });
    }
    const { to, subject, html, text } = req.body ?? {};
    const emailOk =
      typeof to === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
    if (!emailOk) {
      return res.status(400).json({
        error: { message: 'El campo "to" debe ser un email válido.' }
      });
    }
    if (!subject || typeof subject !== 'string') {
      return res.status(400).json({ error: { message: 'Falta "subject".' } });
    }

    const headers = { 'content-type': 'application/json' };
    if (process.env.WEBHOOK_SECRET) {
      headers['x-webhook-secret'] = process.env.WEBHOOK_SECRET;
    }

    const upstream = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: to.trim(),
        subject: String(subject),
        html: typeof html === 'string' ? html : '',
        text: typeof text === 'string' ? text : ''
      })
    });

    const raw = await upstream.text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { raw };
    }

    if (!upstream.ok) {
      return res.status(502).json({
        error: {
          message: `El webhook respondió ${upstream.status}.`,
          upstream: parsed
        }
      });
    }
    return res.json({ ok: true, upstream: parsed });
  } catch (e) {
    return res.status(500).json({
      error: { message: e?.message || 'Error al llamar al webhook.' }
    });
  }
});

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

app.post('/api/lead-score', async (req, res) => {
  try {
    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: { message: 'Falta ANTHROPIC_API_KEY en el servidor (variable de entorno).' }
      });
    }
    const lead = req.body?.lead;
    if (!lead || typeof lead !== 'object') {
      return res.status(400).json({ error: { message: 'Falta objeto "lead" en el cuerpo JSON.' } });
    }
    const userPrompt = buildLeadScoreUserPrompt(lead);

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: LEAD_SCORING_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(upstream.status).json(data);

    const text = data?.content?.[0]?.text ?? '';
    try {
      const result = parseLeadScoreResponse(text);
      return res.json({ result, rawText: text });
    } catch (e) {
      return res.status(502).json({
        error: {
          message: e?.message || 'No se pudo interpretar el JSON del modelo.',
          rawText: text
        }
      });
    }
  } catch (e) {
    return res.status(500).json({
      error: { message: e?.message || 'Error inesperado en lead-score.' }
    });
  }
});

app.post('/api/claude', async (req, res) => {
  try {
    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: { message: 'Falta ANTHROPIC_API_KEY en el servidor (variable de entorno).' }
      });
    }

    const { systemPrompt, userPrompt } = req.body ?? {};
    if (!systemPrompt || !userPrompt) {
      return res.status(400).json({
        error: { message: 'systemPrompt y userPrompt son obligatorios.' }
      });
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(upstream.status).json(data);

    return res.json({
      text: data?.content?.[0]?.text ?? ''
    });
  } catch (e) {
    return res.status(500).json({
      error: { message: e?.message || 'Error inesperado en el proxy.' }
    });
  }
});

app.get('/api/leads', async (_req, res) => {
  try {
    const leads = await listPipelineLeads();
    return res.json({ leads });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    return res.status(500).json({ error: { message: e.message } });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    const { nombre, empresa, lead, result } = req.body ?? {};
    if (!nombre || !empresa || !lead || !result) {
      return res.status(400).json({
        error: {
          message: 'nombre, empresa, lead y result son obligatorios.'
        }
      });
    }
    const entry = await insertPipelineLead({
      nombre: String(nombre),
      empresa: String(empresa),
      lead,
      result
    });
    return res.json({ entry });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    return res.status(500).json({ error: { message: e.message } });
  }
});

app.delete('/api/leads', async (req, res) => {
  try {
    const id = req.query?.id;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: { message: 'Falta ?id=' } });
    }
    await deletePipelineLead(id);
    return res.json({ ok: true });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    return res.status(500).json({ error: { message: e.message } });
  }
});

app.post('/api/log', async (req, res) => {
  try {
    const { module, action, meta } = req.body ?? {};
    if (!module || !action) {
      return res.status(400).json({
        error: { message: 'module y action son obligatorios.' }
      });
    }
    await insertAppEvent(String(module), String(action), meta);
    return res.json({ ok: true });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    return res.status(500).json({ error: { message: e.message } });
  }
});

app.get('/api/generated', async (req, res) => {
  try {
    const singleId = req.query?.id;
    if (typeof singleId === 'string' && singleId.trim()) {
      const item = await getGeneratedById(singleId.trim());
      if (!item) {
        return res.status(404).json({ error: { message: 'No encontrado.' } });
      }
      return res.json({ item });
    }
    const kind = req.query?.kind;
    const limit = req.query?.limit;
    const items = await listGenerated({
      kind: typeof kind === 'string' ? kind : undefined,
      limit: limit != null ? Number(limit) : undefined
    });
    return res.json({ items });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    if (e.message === 'INVALID_KIND') {
      return res.status(400).json({ error: { message: 'kind no válido.' } });
    }
    return res.status(500).json({ error: { message: e.message } });
  }
});

app.get('/api/activity', async (req, res) => {
  try {
    const lim = req.query?.limit != null ? Number(req.query.limit) : 250;
    const cap = Math.min(Math.max(Number(lim) || 250, 10), 500);
    let generated = [];
    let leads = [];
    try {
      generated = await listGenerated({ limit: lim });
    } catch (e) {
      if (e.message === 'NO_DATABASE_URL') throw e;
    }
    try {
      leads = await listPipelineLeads();
    } catch (e) {
      if (e.message === 'NO_DATABASE_URL') throw e;
    }
    const items = buildActivityFeed(generated, leads).slice(0, cap);
    return res.json({ items });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    return res.status(500).json({ error: { message: e.message } });
  }
});

app.get('/api/crm', async (_req, res) => {
  try {
    const contacts = await listCrmContacts();
    return res.json({ contacts });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    return res.status(500).json({ error: { message: e.message } });
  }
});

app.post('/api/crm', async (req, res) => {
  try {
    const b = req.body ?? {};
    const entry = await insertCrmContact({
      nombre: b.nombre,
      empresa: b.empresa,
      email: b.email,
      telefono: b.telefono,
      pais: b.pais,
      web: b.web,
      notas: b.notas
    });
    return res.json({ entry });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    if (e.message === 'INVALID_CRM_FIELDS') {
      return res.status(400).json({
        error: { message: 'nombre y empresa son obligatorios.' }
      });
    }
    return res.status(500).json({ error: { message: e.message } });
  }
});

app.put('/api/crm', async (req, res) => {
  try {
    const b = req.body ?? {};
    if (!b.id) {
      return res.status(400).json({ error: { message: 'Falta id.' } });
    }
    const entry = await updateCrmContact(String(b.id), {
      nombre: b.nombre,
      empresa: b.empresa,
      email: b.email,
      telefono: b.telefono,
      pais: b.pais,
      web: b.web,
      notas: b.notas
    });
    if (!entry) {
      return res.status(404).json({ error: { message: 'No encontrado.' } });
    }
    return res.json({ entry });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    if (e.message === 'INVALID_CRM_FIELDS') {
      return res.status(400).json({
        error: { message: 'nombre y empresa no pueden quedar vacíos.' }
      });
    }
    return res.status(500).json({ error: { message: e.message } });
  }
});

app.delete('/api/crm', async (req, res) => {
  try {
    const id = req.query?.id;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: { message: 'Falta ?id=' } });
    }
    await deleteCrmContact(id.trim());
    return res.json({ ok: true });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    return res.status(500).json({ error: { message: e.message } });
  }
});

app.post('/api/crm/enrich', async (req, res) => {
  try {
    const id = req.body?.id;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: { message: 'Falta id del contacto.' } });
    }
    const result = await runCrmEnrichment(id.trim());
    if (!result.ok) {
      return res.status(result.status).json(result.payload);
    }
    return res.json(result.payload);
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    return res.status(500).json({
      error: { message: e?.message || 'Error en enriquecimiento.' }
    });
  }
});

app.post('/api/crm/next-mail', async (req, res) => {
  try {
    const { id, brief } = req.body ?? {};
    if (!id || typeof id !== 'string') {
      return res
        .status(400)
        .json({ error: { message: 'Falta id del contacto.' } });
    }
    const result = await runCrmNextMail({
      id: id.trim(),
      brief: typeof brief === 'string' ? brief : ''
    });
    if (!result.ok) {
      return res.status(result.status).json(result.payload);
    }
    return res.json(result.payload);
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    return res.status(500).json({
      error: { message: e?.message || 'Error al generar el correo.' }
    });
  }
});

app.post('/api/generated', async (req, res) => {
  try {
    const body = req.body ?? {};
    const {
      kind,
      outputLanguage,
      input,
      bodyHtml,
      bodyPlain,
      subject
    } = body;
    if (!kind || !input || !bodyHtml) {
      return res.status(400).json({
        error: {
          message: 'kind, input y bodyHtml son obligatorios.'
        }
      });
    }
    const entry = await insertGenerated({
      kind: String(kind),
      outputLanguage:
        outputLanguage != null ? String(outputLanguage) : null,
      input,
      bodyHtml: String(bodyHtml),
      bodyPlain: bodyPlain != null ? String(bodyPlain) : null,
      subject: subject != null ? String(subject) : null
    });
    return res.json({ entry });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    if (e.message === 'INVALID_KIND') {
      return res.status(400).json({
        error: {
          message:
            'kind debe ser newsletter, prospect_email o seo.'
        }
      });
    }
    if (e.message === 'INVALID_INPUT' || e.message === 'INVALID_BODY') {
      return res.status(400).json({ error: { message: 'Datos incompletos.' } });
    }
    return res.status(500).json({ error: { message: e.message } });
  }
});

app.put('/api/generated', async (req, res) => {
  try {
    const body = req.body ?? {};
    const id = body.id;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: { message: 'Falta id.' } });
    }
    const entry = await updateGeneratedById(String(id).trim(), {
      bodyHtml: body.bodyHtml,
      bodyPlain: body.bodyPlain,
      subject: body.subject
    });
    if (!entry) {
      return res.status(404).json({ error: { message: 'No encontrado.' } });
    }
    return res.json({ entry });
  } catch (e) {
    if (e.message === 'NO_DATABASE_URL') {
      return res.status(503).json({
        error: { message: 'Base de datos no configurada (DATABASE_URL).' }
      });
    }
    return res.status(500).json({ error: { message: e.message } });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(__dirname));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor listo en http://localhost:${port}`);
});

