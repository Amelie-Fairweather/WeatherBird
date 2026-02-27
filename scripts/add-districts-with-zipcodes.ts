/**
 * Add School Districts with Zip Code Mapping (Option A)
 * Uses the zip code database to automatically map zip codes to districts
 * 
 * Run with: npx tsx scripts/add-districts-with-zipcodes.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getZipCodesForCity, vermontZipCodes } from './zip-code-data';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase credentials in .env.local');
  console.error('   Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface District {
  district_name: string;
  district_code?: string;
  county?: string;
  zip_codes: string[];
  city?: string;
  latitude?: number;
  longitude?: number;
  district_type?: string;
}

// Districts with cities - zip codes will be auto-mapped
const districts: Omit<District, 'zip_codes'>[] = [
  {
    district_name: 'Burlington School District',
    district_code: 'VT-BSD',
    county: 'Chittenden',
    city: 'Burlington',
    latitude: 44.4759,
    longitude: -73.2121,
    district_type: 'school_district',
  },
  {
    district_name: 'Montpelier Roxbury Public Schools',
    district_code: 'VT-MRPS',
    county: 'Washington',
    city: 'Montpelier',
    latitude: 44.2601,
    longitude: -72.5754,
    district_type: 'school_district',
  },
  {
    district_name: 'Rutland City Public Schools',
    district_code: 'VT-RCPS',
    county: 'Rutland',
    city: 'Rutland',
    latitude: 43.6106,
    longitude: -72.9726,
    district_type: 'school_district',
  },
  {
    district_name: 'Barre Unified Union School District',
    district_code: 'VT-BUUSD',
    county: 'Washington',
    city: 'Barre',
    latitude: 44.1970,
    longitude: -72.5021,
    district_type: 'school_district',
  },
  {
    district_name: 'Maple Run Unified School District',
    district_code: 'VT-MRUSD',
    county: 'Franklin',
    city: 'Saint Albans',
    latitude: 44.8109,
    longitude: -73.0846,
    district_type: 'school_district',
  },
  {
    district_name: 'Windham Southeast Supervisory Union',
    district_code: 'VT-WSSU',
    county: 'Windham',
    city: 'Brattleboro',
    latitude: 42.8509,
    longitude: -72.5579,
    district_type: 'supervisory_union',
  },
  {
    district_name: 'Southwest Vermont Supervisory Union',
    district_code: 'VT-SVSU',
    county: 'Bennington',
    city: 'Bennington',
    latitude: 42.8781,
    longitude: -73.1968,
    district_type: 'supervisory_union',
  },
  {
    district_name: 'Addison Central School District',
    district_code: 'VT-ACSD',
    county: 'Addison',
    city: 'Middlebury',
    latitude: 44.0148,
    longitude: -73.1690,
    district_type: 'school_district',
  },
];

async function addDistrictsWithZipCodes() {
  console.log(`Starting to add ${districts.length} districts with auto-mapped zip codes...\n`);

  let added = 0;
  let skipped = 0;
  let errors = 0;

  for (const district of districts) {
    try {
      // Check if district already exists
      const { data: existing } = await supabase
        .from('school_districts')
        .select('id')
        .eq('district_name', district.district_name)
        .single();

      if (existing) {
        console.log(`⏭️  Skipped (already exists): ${district.district_name}`);
        skipped++;
        continue;
      }

      // Auto-map zip codes from the database
      let zipCodes: string[] = [];
      if (district.city) {
        zipCodes = getZipCodesForCity(district.city);
        console.log(`   Found ${zipCodes.length} zip code(s) for ${district.city}: ${zipCodes.join(', ')}`);
      }

      // If no zip codes found, try by county
      if (zipCodes.length === 0 && district.county) {
        const countyZips = vermontZipCodes
          .filter(zip => zip.county.toLowerCase() === district.county!.toLowerCase())
          .slice(0, 5) // Limit to first 5 to avoid too many
          .map(zip => zip.zip);
        zipCodes = countyZips;
        console.log(`   Using county zip codes for ${district.county}: ${zipCodes.join(', ')}`);
      }

      const districtWithZips: District = {
        ...district,
        zip_codes: zipCodes,
      };

      // Insert district
      const { data, error } = await supabase
        .from('school_districts')
        .insert(districtWithZips)
        .select()
        .single();

      if (error) {
        console.error(`❌ Error adding ${district.district_name}:`, error.message);
        errors++;
      } else {
        console.log(`✅ Added: ${district.district_name} (ID: ${data.id}) - ${zipCodes.length} zip codes`);
        added++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${district.district_name}:`, error);
      errors++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Added: ${added}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`\n✅ Done! Districts are now in the database with zip codes mapped.`);
}

// Run the function
addDistrictsWithZipCodes().catch(console.error);









