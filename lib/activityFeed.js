function stripHtml(s) {
  return String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function snippetFromHtml(html, max = 200) {
  const t = stripHtml(html);
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function titleForGenerated(g) {
  if (g.kind === 'prospect_email' && g.subject) return `Email · ${g.subject}`;
  if (g.kind === 'prospect_email') return 'Email de prospecto';
  if (g.kind === 'seo') {
    const tema = g.input?.tema;
    return tema ? `SEO · ${tema}` : 'Contenido SEO';
  }
  if (g.kind === 'newsletter') return 'Newsletter';
  return 'Generado';
}

function subtitleForGenerated(g) {
  const lang = g.outputLanguage || '';
  const parts = [lang];
  if (g.kind === 'seo' && g.input?.tipo) parts.push(String(g.input.tipo));
  return parts.filter(Boolean).join(' · ');
}

export function buildActivityFeed(generatedList, pipelineList) {
  const gItems = (generatedList || []).map((g) => ({
    feedType: 'generated',
    subtype: g.kind,
    id: g.id,
    createdAt: g.createdAt,
    title: titleForGenerated(g),
    subtitle: subtitleForGenerated(g),
    snippet: snippetFromHtml(g.bodyHtml, 220),
    preview: {
      subject: g.subject || null,
      outputLanguage: g.outputLanguage || null,
      input: g.input || {}
    }
  }));

  const pItems = (pipelineList || []).map((l) => ({
    feedType: 'pipeline_lead',
    id: l.id,
    createdAt: l.createdAt,
    title: `${l.nombre} · ${l.empresa}`,
    subtitle: `Scoring · ${l.result?.score ?? '—'} · ${l.result?.tier ?? ''} · ${l.result?.tier_label ?? ''}`,
    snippet: stripHtml(l.result?.recommended_approach || '').slice(0, 220),
    preview: {
      nombre: l.nombre,
      empresa: l.empresa,
      score: l.result?.score,
      tier: l.result?.tier
    },
    lead: l.lead,
    result: l.result
  }));

  return [...gItems, ...pItems].sort((a, b) => b.createdAt - a.createdAt);
}
