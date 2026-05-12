-- Copy and paste this script into your Supabase SQL Editor to initialize the database

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  emoji TEXT,
  is_open BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS nominees (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  photo_url TEXT,
  tagline TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS votes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  nominee_id TEXT REFERENCES nominees(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL,
  voted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(category_id, voter_id)
);

-- For a simple app using frontend-only password auth, we'll allow anon access.
-- Warning: In a production app, you should use Supabase Auth for Admin management.
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominees ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Allow anonymous all categories" ON categories FOR ALL USING (true);

CREATE POLICY "Allow anonymous read nominees" ON nominees FOR SELECT USING (true);
CREATE POLICY "Allow anonymous all nominees" ON nominees FOR ALL USING (true);

CREATE POLICY "Allow anonymous read votes" ON votes FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert votes" ON votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous all votes" ON votes FOR ALL USING (true);
