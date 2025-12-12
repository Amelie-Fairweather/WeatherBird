-- Create a table to store road condition data from New England 511
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS road_conditions (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'new_england_511', -- 'new_england_511', 'nws', 'vtrans', etc.
  region TEXT NOT NULL, -- 'Vermont', 'New Hampshire', 'Maine'
  route_name TEXT,
  location TEXT,
  condition_type TEXT NOT NULL, -- 'incident', 'closure', 'sensor', 'traffic'
  description TEXT,
  severity TEXT, -- 'minor', 'moderate', 'severe', 'closed'
  status TEXT, -- 'active', 'cleared', 'scheduled'
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  -- For sensor data
  temperature DECIMAL(5, 2),
  surface_condition TEXT, -- 'dry', 'wet', 'snow', 'ice', 'slush'
  visibility DECIMAL(5, 2),
  wind_speed DECIMAL(5, 2),
  -- Raw data from API
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_road_conditions_region ON road_conditions(region);
CREATE INDEX IF NOT EXISTS idx_road_conditions_type ON road_conditions(condition_type);
CREATE INDEX IF NOT EXISTS idx_road_conditions_status ON road_conditions(status);
CREATE INDEX IF NOT EXISTS idx_road_conditions_created ON road_conditions(created_at);
CREATE INDEX IF NOT EXISTS idx_road_conditions_source ON road_conditions(source);

-- Create a table to link road conditions to knowledge documents
CREATE TABLE IF NOT EXISTS knowledge_road_links (
  id BIGSERIAL PRIMARY KEY,
  knowledge_document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  road_condition_id BIGINT NOT NULL REFERENCES road_conditions(id) ON DELETE CASCADE,
  relationship_type TEXT, -- 'example', 'related', 'context', 'warning'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(knowledge_document_id, road_condition_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_road_link_doc ON knowledge_road_links(knowledge_document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_road_link_road ON knowledge_road_links(road_condition_id);







