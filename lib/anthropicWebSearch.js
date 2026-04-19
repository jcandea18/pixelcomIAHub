/**
 * Parsing de respuestas Messages cuando se usa la herramienta web_search de Anthropic.
 */

export function extractAssistantText(message) {
  const blocks = message?.content;
  if (!Array.isArray(blocks)) return '';
  const texts = blocks.filter((b) => b.type === 'text' && b.text);
  if (!texts.length) return '';
  return String(texts[texts.length - 1].text || '').trim();
}

export function extractWebSourcesFromMessage(message) {
  const seen = new Set();
  const out = [];

  function tryAdd(title, url) {
    if (!url || typeof url !== 'string') return;
    const u = url.trim();
    if (!/^https?:\/\//i.test(u) || u.length > 4096 || seen.has(u)) return;
    seen.add(u);
    out.push({ title: (title && String(title).trim()) || u, url: u });
  }

  function visit(node, depth = 0) {
    if (!node || out.length >= 25 || depth > 18) return;
    if (typeof node === 'string') {
      if (/^https?:\/\//i.test(node) && node.length < 4096) {
        tryAdd(node.slice(0, 120), node);
      }
      return;
    }
    if (typeof node !== 'object') return;

    const u =
      node.url ||
      node.uri ||
      node.href ||
      node.canonical_url ||
      node.source?.url;
    const t =
      node.title ||
      node.name ||
      node.page_title ||
      node.snippet?.slice?.(0, 100);
    tryAdd(t, u);

    if (Array.isArray(node)) {
      node.forEach((x) => visit(x, depth + 1));
    } else if (node.type === 'text' && Array.isArray(node.citations)) {
      for (const c of node.citations) {
        tryAdd(c.title || c.cited_text, c.url || c.uri);
        visit(c, depth + 1);
      }
      visit(node.text, depth + 1);
    } else {
      Object.values(node).forEach((x) => visit(x, depth + 1));
    }
  }

  visit(message?.content);
  visit(message);
  return out;
}

export function buildWebSearchToolDef() {
  const toolType =
    process.env.ANTHROPIC_WEB_SEARCH_TOOL_TYPE || 'web_search_20250305';
  const maxUsesRaw = process.env.ANTHROPIC_WEB_SEARCH_MAX_USES;
  const maxUses =
    maxUsesRaw != null && String(maxUsesRaw).trim() !== ''
      ? Math.min(20, Math.max(1, Number(maxUsesRaw) || 5))
      : 8;
  return {
    type: toolType,
    name: 'web_search',
    max_uses: maxUses
  };
}
