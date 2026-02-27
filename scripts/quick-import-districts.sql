-- Quick Import: Major Vermont School Districts
-- Run this in Supabase SQL Editor to add some initial districts
-- You can expand this list by extracting from the PDF and shapefile

INSERT INTO school_districts (
  district_name,
  district_code,
  county,
  zip_codes,
  city,
  latitude,
  longitude,
  district_type
) VALUES
  -- Burlington (Chittenden County)
  (
    'Burlington School District',
    'VT-BSD',
    'Chittenden',
    ARRAY['05401', '05402', '05405'],
    'Burlington',
    44.4759,
    -73.2121,
    'school_district'
  ),
  -- Montpelier (Washington County)
  (
    'Montpelier Roxbury Public Schools',
    'VT-MRPS',
    'Washington',
    ARRAY['05602', '05669'],
    'Montpelier',
    44.2601,
    -72.5754,
    'school_district'
  ),
  -- Rutland (Rutland County)
  (
    'Rutland City Public Schools',
    'VT-RCPS',
    'Rutland',
    ARRAY['05701', '05702'],
    'Rutland',
    43.6106,
    -72.9726,
    'school_district'
  ),
  -- Barre (Washington County)
  (
    'Barre Unified Union School District',
    'VT-BUUSD',
    'Washington',
    ARRAY['05641'],
    'Barre',
    44.1970,
    -72.5021,
    'school_district'
  ),
  -- St. Albans (Franklin County)
  (
    'Maple Run Unified School District',
    'VT-MRUSD',
    'Franklin',
    ARRAY['05478'],
    'St. Albans',
    44.8109,
    -73.0846,
    'school_district'
  ),
  -- Brattleboro (Windham County)
  (
    'Windham Southeast Supervisory Union',
    'VT-WSSU',
    'Windham',
    ARRAY['05301'],
    'Brattleboro',
    42.8509,
    -72.5579,
    'supervisory_union'
  ),
  -- Bennington (Bennington County)
  (
    'Southwest Vermont Supervisory Union',
    'VT-SVSU',
    'Bennington',
    ARRAY['05201'],
    'Bennington',
    42.8781,
    -73.1968,
    'supervisory_union'
  ),
  -- Middlebury (Addison County)
  (
    'Addison Central School District',
    'VT-ACSD',
    'Addison',
    ARRAY['05753'],
    'Middlebury',
    44.0148,
    -73.1690,
    'school_district'
  )
ON CONFLICT (district_name) DO NOTHING;

-- After running this, you can:
-- 1. Extract more districts from the PDF and add them
-- 2. Use the shapefile to get exact boundaries and coordinates
-- 3. Map zip codes using Vermont geodata










