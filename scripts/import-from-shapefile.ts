/**
 * Import School Districts from Shapefile (converted to GeoJSON)
 * 
 * Usage:
 * 1. First convert shapefile to GeoJSON:
 *    ogr2ogr -f GeoJSON districts.geojson "/path/to/shapefile.shp"
 * 
 * 2. Then run this script:
 *    npx tsx scripts/import-from-shapefile.ts
 */

import { supabase } from '../lib/supabaseClient';
import * as fs from 'fs';
import * as path from 'path';

interface GeoJSONFeature {
  type: string;
  properties: {
    [key: string]: any;
  };
  geometry: {
    type: string;
    coordinates: any;
  };
}

interface GeoJSON {
  type: string;
  features: GeoJSONFeature[];
}

/**
 * Calculate centroid from polygon coordinates
 */
function calculateCentroid(coordinates: number[][][]): { lat: number; lon: number } {
  let totalLat = 0;
  let totalLon = 0;
  let count = 0;

  // Flatten coordinates array
  const flattenCoords = (coords: any[]): number[][] => {
    const result: number[][] = [];
    for (const coord of coords) {
      if (typeof coord[0] === 'number') {
        result.push(coord);
      } else {
        result.push(...flattenCoords(coord));
      }
    }
    return result;
  };

  const allCoords = flattenCoords(coordinates);
  
  for (const coord of allCoords) {
    totalLon += coord[0]; // longitude
    totalLat += coord[1]; // latitude
    count++;
  }

  return {
    lon: totalLon / count,
    lat: totalLat / count,
  };
}

/**
 * Extract district name from properties
 */
function extractDistrictName(props: { [key: string]: any }): string {
  // Try common property names
  const possibleKeys = [
    'DISTRICT_NAME',
    'DISTRICT_NA',
    'NAME',
    'SCHOOL_DIS',
    'SCHOOL_DISTRICT',
    'LEA_NAME',
    'LEANAME',
    'DISTRICT',
  ];

  for (const key of possibleKeys) {
    if (props[key]) {
      return String(props[key]).trim();
    }
  }

  return 'Unknown District';
}

/**
 * Extract district code from properties
 */
function extractDistrictCode(props: { [key: string]: any }): string | undefined {
  const possibleKeys = [
    'DISTRICT_CODE',
    'CODE',
    'LEAID',
    'LEA_ID',
    'FIPST',
    'ST_LEAID',
  ];

  for (const key of possibleKeys) {
    if (props[key]) {
      return String(props[key]).trim();
    }
  }

  return undefined;
}

/**
 * Import districts from GeoJSON
 */
async function importFromGeoJSON(geojsonPath: string) {
  console.log(`Reading GeoJSON from: ${geojsonPath}`);

  const fileContent = fs.readFileSync(geojsonPath, 'utf-8');
  const geojson: GeoJSON = JSON.parse(fileContent);

  console.log(`Found ${geojson.features.length} features\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < geojson.features.length; i++) {
    const feature = geojson.features[i];
    const props = feature.properties;

    try {
      // Extract district information
      const districtName = extractDistrictName(props);
      
      // Check if already exists
      const { data: existing } = await supabase
        .from('school_districts')
        .select('id')
        .eq('district_name', districtName)
        .single();

      if (existing) {
        console.log(`⏭️  [${i + 1}/${geojson.features.length}] Skipped (exists): ${districtName}`);
        skipped++;
        continue;
      }

      // Calculate centroid
      let lat: number | undefined;
      let lon: number | undefined;

      if (feature.geometry.type === 'Polygon' && feature.geometry.coordinates) {
        const centroid = calculateCentroid(feature.geometry.coordinates);
        lat = centroid.lat;
        lon = centroid.lon;
      } else if (feature.geometry.type === 'Point' && feature.geometry.coordinates) {
        lon = feature.geometry.coordinates[0];
        lat = feature.geometry.coordinates[1];
      }

      // Extract other properties
      const districtCode = extractDistrictCode(props);
      const county = props.COUNTY || props.County || props.county;
      const city = props.CITY || props.City || props.city || props.NAME;
      
      // For zip codes, we'll need to reverse geocode or use a separate mapping
      // For now, leave empty and add manually
      const zipCodes: string[] = [];

      const districtData = {
        district_name: districtName,
        district_code: districtCode,
        county: county,
        zip_codes: zipCodes,
        city: city,
        latitude: lat,
        longitude: lon,
        district_type: props.DISTRICT_TYPE || props.TYPE || 'school_district',
      };

      // Insert into database
      const { data, error } = await supabase
        .from('school_districts')
        .insert(districtData)
        .select()
        .single();

      if (error) {
        console.error(`❌ [${i + 1}/${geojson.features.length}] Error: ${districtName} -`, error.message);
        errors++;
      } else {
        console.log(`✅ [${i + 1}/${geojson.features.length}] Imported: ${districtName}${lat && lon ? ` (${lat.toFixed(4)}, ${lon.toFixed(4)})` : ''}`);
        imported++;
      }
    } catch (error) {
      console.error(`❌ [${i + 1}/${geojson.features.length}] Error processing feature:`, error);
      errors++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Imported: ${imported}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`\n⚠️  Note: Zip codes need to be added manually or via reverse geocoding`);
}

// Run if called directly
const geojsonPath = process.argv[2] || path.join(__dirname, '../districts-extracted.json');

if (fs.existsSync(geojsonPath)) {
  importFromGeoJSON(geojsonPath).catch(console.error);
} else {
  console.error(`GeoJSON file not found: ${geojsonPath}`);
  console.log('\nTo convert shapefile to GeoJSON, run:');
  console.log('  ogr2ogr -f GeoJSON districts-extracted.json "/path/to/shapefile.shp"');
  process.exit(1);
}









