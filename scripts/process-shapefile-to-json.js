/**
 * Process Shapefile to JSON
 * 
 * This script requires GDAL/OGR to be installed:
 * macOS: brew install gdal
 * Then run: node scripts/process-shapefile-to-json.js
 * 
 * Or convert manually using ogr2ogr:
 * ogr2ogr -f GeoJSON districts.geojson "/path/to/shapefile.shp"
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SHAPEFILE_DIR = '/Users/ameliefairweather/Downloads/FS_VCGI_OPENDATA_Boundary_ORTHO83_poly_SP_v1_1212542000286029149';
const SHAPEFILE_PATH = path.join(SHAPEFILE_DIR, 'VT_NAD83_Orthophoto_Boundaries_-_polygons.shp');
const OUTPUT_FILE = path.join(__dirname, '../districts-extracted.json');

try {
  console.log('Converting shapefile to GeoJSON...');
  
  // Check if ogr2ogr is available
  try {
    execSync('which ogr2ogr', { stdio: 'ignore' });
  } catch {
    throw new Error('ogr2ogr not found. Please install GDAL: brew install gdal');
  }

  // Convert shapefile to GeoJSON
  const command = `ogr2ogr -f GeoJSON "${OUTPUT_FILE}" "${SHAPEFILE_PATH}" -t_srs EPSG:4326`;
  
  console.log('Running:', command);
  execSync(command, { stdio: 'inherit' });
  
  console.log(`\n✓ Conversion complete! GeoJSON saved to: ${OUTPUT_FILE}`);
  console.log('\nNext step: Run the import script to load into Supabase');
  
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}









