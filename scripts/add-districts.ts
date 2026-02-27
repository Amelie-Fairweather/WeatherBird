/**
 * Add School Districts Manually (Option A)
 * 
 * Run with:
 *   npx tsx scripts/add-districts.ts
 * 
 * Make sure your .env.local has:
 *   NEXT_PUBLIC_SUPABASE_URL=your_url
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

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

// Add your districts here
const districts: District[] = [
  {
    district_name: 'Burlington School District',
    district_code: 'VT-BSD',
    county: 'Chittenden',
    zip_codes: ['05401', '05402', '05405'],
    city: 'Burlington',
    latitude: 44.4759,
    longitude: -73.2121,
    district_type: 'school_district',
  },
  {
    district_name: 'Montpelier Roxbury Public Schools',
    district_code: 'VT-MRPS',
    county: 'Washington',
    zip_codes: ['05602', '05669'],
    city: 'Montpelier',
    latitude: 44.2601,
    longitude: -72.5754,
    district_type: 'school_district',
  },
  {
    district_name: 'Rutland City Public Schools',
    district_code: 'VT-RCPS',
    county: 'Rutland',
    zip_codes: ['05701', '05702'],
    city: 'Rutland',
    latitude: 43.6106,
    longitude: -72.9726,
    district_type: 'school_district',
  },
  {
    district_name: 'Barre Unified Union School District',
    district_code: 'VT-BUUSD',
    county: 'Washington',
    zip_codes: ['05641'],
    city: 'Barre',
    latitude: 44.1970,
    longitude: -72.5021,
    district_type: 'school_district',
  },
  {
    district_name: 'Maple Run Unified School District',
    district_code: 'VT-MRUSD',
    county: 'Franklin',
    zip_codes: ['05478'],
    city: 'St. Albans',
    latitude: 44.8109,
    longitude: -73.0846,
    district_type: 'school_district',
  },
  {
    district_name: 'Windham Southeast Supervisory Union',
    district_code: 'VT-WSSU',
    county: 'Windham',
    zip_codes: ['05301'],
    city: 'Brattleboro',
    latitude: 42.8509,
    longitude: -72.5579,
    district_type: 'supervisory_union',
  },
  {
    district_name: 'Southwest Vermont Supervisory Union',
    district_code: 'VT-SVSU',
    county: 'Bennington',
    zip_codes: ['05201'],
    city: 'Bennington',
    latitude: 42.8781,
    longitude: -73.1968,
    district_type: 'supervisory_union',
  },
  {
    district_name: 'Addison Central School District',
    district_code: 'VT-ACSD',
    county: 'Addison',
    zip_codes: ['05753'],
    city: 'Middlebury',
    latitude: 44.0148,
    longitude: -73.1690,
    district_type: 'school_district',
  },
];

async function addDistricts() {
  console.log(`Starting to add ${districts.length} districts...\n`);

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

      // Insert district
      const { data, error } = await supabase
        .from('school_districts')
        .insert(district)
        .select()
        .single();

      if (error) {
        console.error(`❌ Error adding ${district.district_name}:`, error.message);
        errors++;
      } else {
        console.log(`✅ Added: ${district.district_name} (ID: ${data.id})`);
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
  console.log(`\n✅ Done! Districts are now in the database.`);
}

// Run the function
addDistricts().catch(console.error);









