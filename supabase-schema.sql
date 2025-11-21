-- Create the express_client_portals table
CREATE TABLE IF NOT EXISTS express_client_portals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  file_url TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

-- Create an index on slug for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_portals_slug ON client_portals(slug);

-- Create an index on client_email for admin queries
CREATE INDEX IF NOT EXISTS idx_client_portals_email ON client_portals(client_email);

-- Enable Row Level Security (RLS)
ALTER TABLE client_portals ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows service role to do everything
-- In production, you might want more restrictive policies
CREATE POLICY "Service role can do everything" ON express_client_portals
  FOR ALL
  USING (true)
  WITH CHECK (true);

