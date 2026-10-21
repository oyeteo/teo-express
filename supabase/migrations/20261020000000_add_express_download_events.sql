CREATE TABLE IF NOT EXISTS express_download_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id UUID NOT NULL REFERENCES express_client_portals(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('opened', 'downloaded')),
  file_id TEXT,
  file_name TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_express_download_events_portal
  ON express_download_events (portal_id, created_at DESC);

ALTER TABLE express_download_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE express_download_events FROM anon;
REVOKE ALL ON TABLE express_download_events FROM authenticated;

DROP POLICY IF EXISTS "Service role can manage express download events" ON express_download_events;
CREATE POLICY "Service role can manage express download events" ON express_download_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE express_client_portals
  ALTER COLUMN client_email SET DEFAULT '';
