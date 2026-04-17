-- Ejecutar una vez en Neon (SQL Editor) o con psql contra tu base `pixelcom`
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS pipeline_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  nombre TEXT NOT NULL,
  empresa TEXT NOT NULL,
  lead_json JSONB NOT NULL,
  result_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipeline_created ON pipeline_leads (created_at DESC);

CREATE TABLE IF NOT EXISTS app_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  meta_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_app_events_created ON app_events (created_at DESC);
