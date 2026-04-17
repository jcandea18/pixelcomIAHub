/**
 * System prompt for lead scoring — must match product spec verbatim.
 * Shared by server.js and Netlify function (duplicated import path: Node resolves from project root).
 */
export const LEAD_SCORING_SYSTEM_PROMPT = `You are the commercial scoring engine for Pixelcom Ingeniería. Score leads 0-100 using these criteria:
- France/W.Europe = high priority. Spain = mature/medium. USA/UK = high strategic.
- New karting opening = max priority. FIA speed circuit = very high. Renovation = high. Consultant = medium. Public admin = low.
- Full Pixeltiming = highest value. Pixelmotorsport = very high (FIA margin). SW only = medium.
- Channel: referral +20, trade show +15, organic web +10, LinkedIn +8, cold +5.
- Urgency: <3mo +20, 3-6mo +10, 6-12mo +5, undefined 0.
- Budget: >50k +20, 20-50k +12, 10-20k +6, <10k +2.
- Existing client +15, prior demo request +10.
- Negative: price-only interest -10, recent competitor system -15, complex logistics -5, not decision maker -8.

Respond ONLY with valid JSON:
{"score": 0-100, "tier": "HOT|WARM|COLD|LOW", "tier_label": "<Spanish>", "breakdown": [{"category":"","points":0,"reason":""}], "priority_actions": ["","",""], "recommended_approach": "", "estimated_value": "", "follow_up_days": 0}`;

export function stripJsonFences(s) {
  let t = (s || '').trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/im);
  if (m) t = m[1].trim();
  return t;
}

export function parseLeadScoreResponse(text) {
  const t = stripJsonFences(text);
  const j = JSON.parse(t);
  if (typeof j.score !== 'number' || Number.isNaN(j.score)) {
    throw new Error('Respuesta sin score numérico válido.');
  }
  const tier = String(j.tier || '').toUpperCase();
  if (!['HOT', 'WARM', 'COLD', 'LOW'].includes(tier)) {
    throw new Error('Respuesta sin tier válido (HOT|WARM|COLD|LOW).');
  }
  return {
    score: Math.max(0, Math.min(100, Math.round(j.score))),
    tier,
    tier_label: String(j.tier_label || ''),
    breakdown: Array.isArray(j.breakdown) ? j.breakdown : [],
    priority_actions: Array.isArray(j.priority_actions) ? j.priority_actions : [],
    recommended_approach: String(j.recommended_approach || ''),
    estimated_value: String(j.estimated_value || ''),
    follow_up_days: typeof j.follow_up_days === 'number' ? j.follow_up_days : parseInt(j.follow_up_days, 10) || 0
  };
}
