-- Run this SQL in your Supabase SQL Editor to create the weather_data table

CREATE TABLE IF NOT EXISTS weather_data (
  id BIGSERIAL PRIMARY KEY,
  location TEXT NOT NULL,
  temperature DECIMAL(5, 2) NOT NULL,
  humidity INTEGER NOT NULL,
  pressure DECIMAL(7, 2) NOT NULL,
  description TEXT NOT NULL,
  wind_speed DECIMAL(5, 2) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create an index on location and timestamp for faster queries
CREATE INDEX IF NOT EXISTS idx_weather_location ON weather_data(location);
CREATE INDEX IF NOT EXISTS idx_weather_timestamp ON weather_data(timestamp);

-- Optional: Enable Row Level Security (RLS) if you want to restrict access
-- ALTER TABLE weather_data ENABLE ROW LEVEL SECURITY;

-- Optional: Create a policy to allow all operations (adjust as needed)
-- CREATE POLICY "Allow all operations" ON weather_data FOR ALL USING (true);


