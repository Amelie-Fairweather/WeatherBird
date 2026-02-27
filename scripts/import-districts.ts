/**
 * Import Vermont School Districts from PDF and Shapefile data
 * 
 * Usage:
 * 1. Extract district codes from PDF manually or use a PDF parser
 * 2. Convert shapefile to GeoJSON (use ogr2ogr or QGIS)
 * 3. Run this script to import into Supabase
 */

import { supabase } from '../lib/supabaseClient';

// Example: Manual district data (you'll need to extract from PDF)
// Format: District Name, Code, County, Zip Codes, City, Lat, Long
interface DistrictImportData {
  district_name: string;
  district_code?: string;
  county?: string;
  zip_codes: string[];
  city?: string;
  latitude?: number;
  longitude?: number;
  district_type?: string;
}

// Sample data - replace with actual data from PDF
const districts: DistrictImportData[] = [
  // Add districts here after extracting from PDF
  // Example:
  // {
  //   district_name: 'Burlington School District',
  //   district_code: 'VT-BSD',
  //   county: 'Chittenden',
  //   zip_codes: ['05401', '05402', '05405'],
  //   city: 'Burlington',
  //   latitude: 44.4759,
  //   longitude: -73.2121,
  // },
];

/**
 * Import districts into Supabase
 */
async function importDistricts() {
  console.log(`Starting import of ${districts.length} districts...`);

  for (const district of districts) {
    try {
      // Check if district already exists
      const { data: existing } = await supabase
        .from('school_districts')
        .select('id')
        .eq('district_name', district.district_name)
        .single();

      if (existing) {
        console.log(`✓ ${district.district_name} already exists, skipping...`);
        continue;
      }

      // Insert new district
      const { data, error } = await supabase
        .from('school_districts')
        .insert(district)
        .select()
        .single();

      if (error) {
        console.error(`✗ Error importing ${district.district_name}:`, error.message);
      } else {
        console.log(`✓ Imported: ${district.district_name} (ID: ${data.id})`);
      }
    } catch (error) {
      console.error(`✗ Error processing ${district.district_name}:`, error);
    }
  }

  console.log('Import complete!');
}

/**
 * Convert shapefile coordinates to district data
 * This would be run after converting shapefile to GeoJSON
 */
async function importFromGeoJSON(geojsonData: any) {
  console.log('Importing from GeoJSON...');

  for (const feature of geojsonData.features) {
    const props = feature.properties;
    const geometry = feature.geometry;

    // Calculate centroid from polygon
    let lat: number | undefined;
    let lon: number | undefined;

    if (geometry.type === 'Polygon') {
      // Calculate centroid of polygon
      const coords = geometry.coordinates[0];
      const sum = coords.reduce(
        (acc: [number, number], coord: [number, number]) => [
          acc[0] + coord[0],
          acc[1] + coord[1],
        ],
        [0, 0]
      );
      lon = sum[0] / coords.length;
      lat = sum[1] / coords.length;
    } else if (geometry.type === 'Point') {
      lon = geometry.coordinates[0];
      lat = geometry.coordinates[1];
    }

    const district: DistrictImportData = {
      district_name: props.DISTRICT_NAME || props.NAME || props.district_name,
      district_code: props.DISTRICT_CODE || props.CODE || props.district_code,
      county: props.COUNTY || props.county,
      zip_codes: props.ZIP_CODES ? props.ZIP_CODES.split(',') : [],
      city: props.CITY || props.city,
      latitude: lat,
      longitude: lon,
      district_type: props.DISTRICT_TYPE || props.district_type,
    };

    try {
      const { data, error } = await supabase
        .from('school_districts')
        .insert(district)
        .select()
        .single();

      if (error) {
        console.error(`✗ Error importing ${district.district_name}:`, error.message);
      } else {
        console.log(`✓ Imported: ${district.district_name}`);
      }
    } catch (error) {
      console.error(`✗ Error processing ${district.district_name}:`, error);
    }
  }
}

// Run if called directly
if (require.main === module) {
  importDistricts().catch(console.error);
}

export { importDistricts, importFromGeoJSON };










