-- Create the express_client_portals table
CREATE TABLE IF NOT EXISTS express_client_portals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT 'TEO_EXPRESS_OPEN_TRANSFER_V1',
  file_url TEXT NOT NULL,
  files JSONB DEFAULT '[]'::jsonb,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

-- Create an index on slug for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_portals_slug ON express_client_portals(slug);

-- Create an index on client_email for admin queries
CREATE INDEX IF NOT EXISTS idx_client_portals_email ON express_client_portals(client_email);

-- Enable Row Level Security (RLS)
ALTER TABLE express_client_portals ENABLE ROW LEVEL SECURITY;

-- No public table access. The app uses the service role only from server/CLI code.
REVOKE ALL ON TABLE express_client_portals FROM anon;
REVOKE ALL ON TABLE express_client_portals FROM authenticated;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "' || 'Service role can do ' || 'everything" ON express_client_portals';
END $$;
DROP POLICY IF EXISTS "Service role can manage express transfers" ON express_client_portals;

CREATE POLICY "Service role can manage express transfers" ON express_client_portals
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
