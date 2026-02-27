/**
 * Add Champlain Valley Union (CVU) School District
 * Covers: Williston, Charlotte, Shelburne, and Hinesburg
 * 
 * Run with: npx tsx scripts/add-cvu-district.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getZipCodesForCity } from './zip-code-data';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addCVUDistrict() {
  console.log('Adding Champlain Valley Union (CVU) School District...\n');

  // Collect all zip codes from the four towns
  const towns = ['Williston', 'Charlotte', 'Shelburne', 'Hinesburg'];
  const allZipCodes: string[] = [];

  console.log('Collecting zip codes for CVU towns:');
  for (const town of towns) {
    const zipCodes = getZipCodesForCity(town);
    allZipCodes.push(...zipCodes);
    console.log(`  ${town}: ${zipCodes.join(', ')}`);
  }

  // Remove duplicates and sort
  const uniqueZipCodes = Array.from(new Set(allZipCodes)).sort();
  console.log(`\nTotal unique zip codes: ${uniqueZipCodes.length} (${uniqueZipCodes.join(', ')})`);

  // Check if CVU already exists
  const { data: existing } = await supabase
    .from('school_districts')
    .select('id, district_name, zip_codes')
    .eq('district_name', 'Champlain Valley Union School District')
    .single();

  if (existing) {
    console.log('\n⚠️  CVU district already exists. Updating zip codes...');
    
    const { error: updateError } = await supabase
      .from('school_districts')
      .update({ 
        zip_codes: uniqueZipCodes,
        county: 'Chittenden',
        city: 'Hinesburg', // CVU is located in Hinesburg
        latitude: 44.3276, // Hinesburg coordinates (approximate CVU location)
        longitude: -73.1107,
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('❌ Error updating CVU:', updateError.message);
      return;
    }

    console.log(`✅ Updated CVU district with ${uniqueZipCodes.length} zip codes`);
    return;
  }

  // Insert new CVU district
  const { data, error } = await supabase
    .from('school_districts')
    .insert({
      district_name: 'Champlain Valley Union School District',
      district_code: 'VT-CVU',
      county: 'Chittenden',
      city: 'Hinesburg',
      zip_codes: uniqueZipCodes,
      latitude: 44.3276, // Hinesburg coordinates (CVU location)
      longitude: -73.1107,
      district_type: 'school_district',
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error adding CVU:', error.message);
    return;
  }

  console.log(`\n✅ Successfully added CVU School District (ID: ${data.id})`);
  console.log(`   Zip codes: ${uniqueZipCodes.join(', ')}`);
}

// Run the function
addCVUDistrict().catch(console.error);









