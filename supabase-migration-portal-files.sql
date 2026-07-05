-- Run once on existing projects that already have express_client_portals.
ALTER TABLE express_client_portals
  ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]'::jsonb;

ALTER TABLE express_client_portals
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '14 days');

UPDATE express_client_portals
SET password_hash = 'TEO_EXPRESS_OPEN_TRANSFER_V1'
WHERE password_hash IS NULL;

ALTER TABLE express_client_portals
  ALTER COLUMN password_hash SET DEFAULT 'TEO_EXPRESS_OPEN_TRANSFER_V1',
  ALTER COLUMN password_hash SET NOT NULL;

UPDATE express_client_portals
SET expires_at = NOW() + INTERVAL '14 days'
WHERE expires_at IS NULL;

ALTER TABLE express_client_portals
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE express_client_portals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can do everything" ON express_client_portals;
DROP POLICY IF EXISTS "Service role can manage express transfers" ON express_client_portals;

REVOKE ALL ON TABLE express_client_portals FROM anon;
REVOKE ALL ON TABLE express_client_portals FROM authenticated;

CREATE POLICY "Service role can manage express transfers" ON express_client_portals
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
