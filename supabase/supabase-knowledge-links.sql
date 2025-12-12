-- Create a table to track knowledge base documents and their links to other data
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id BIGSERIAL PRIMARY KEY,
  pinecone_id TEXT NOT NULL UNIQUE, -- The ID used in Pinecone
  title TEXT,
  category TEXT,
  source TEXT,
  content TEXT, -- Store the original text content
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create a junction table to link knowledge documents to weather data
CREATE TABLE IF NOT EXISTS knowledge_weather_links (
  id BIGSERIAL PRIMARY KEY,
  knowledge_document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  weather_data_id BIGINT NOT NULL REFERENCES weather_data(id) ON DELETE CASCADE,
  relationship_type TEXT, -- e.g., 'example', 'related', 'context'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(knowledge_document_id, weather_data_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_knowledge_pinecone_id ON knowledge_documents(pinecone_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_documents(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_weather_link_doc ON knowledge_weather_links(knowledge_document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_weather_link_weather ON knowledge_weather_links(weather_data_id);

-- Optional: Enable RLS if needed
-- ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE knowledge_weather_links ENABLE ROW LEVEL SECURITY;

