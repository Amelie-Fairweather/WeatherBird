/**
 * Update existing districts with all matching zip codes
 * 
 * Run with: npx tsx scripts/update-districts-zipcodes.ts
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

async function updateDistrictsZipCodes() {
  console.log('Fetching all districts from database...\n');

  // Get all districts
  const { data: districts, error: fetchError } = await supabase
    .from('school_districts')
    .select('id, district_name, city, zip_codes');

  if (fetchError) {
    console.error('❌ Error fetching districts:', fetchError.message);
    return;
  }

  if (!districts || districts.length === 0) {
    console.log('No districts found in database.');
    return;
  }

  console.log(`Found ${districts.length} districts to update.\n`);

  let updated = 0;
  let errors = 0;

  for (const district of districts) {
    try {
      if (!district.city) {
        console.log(`⏭️  Skipped ${district.district_name} (no city)`);
        continue;
      }

      // Get all zip codes for this city
      const allZipCodes = getZipCodesForCity(district.city);
      
      // Remove duplicates and sort
      const uniqueZipCodes = Array.from(new Set(allZipCodes)).sort();

      if (uniqueZipCodes.length === 0) {
        console.log(`⚠️  No zip codes found for ${district.city}`);
        continue;
      }

      // Check if update is needed
      const currentZips = district.zip_codes || [];
      const currentZipsSet = new Set(currentZips);
      const newZipsSet = new Set(uniqueZipCodes);
      
      if (currentZips.length === uniqueZipCodes.length && 
          currentZips.every((zip: string) => newZipsSet.has(zip))) {
        console.log(`✓ ${district.district_name}: Already has all zip codes (${currentZips.length})`);
        continue;
      }

      // Update the district
      const { error: updateError } = await supabase
        .from('school_districts')
        .update({ zip_codes: uniqueZipCodes })
        .eq('id', district.id);

      if (updateError) {
        console.error(`❌ Error updating ${district.district_name}:`, updateError.message);
        errors++;
      } else {
        console.log(`✅ Updated ${district.district_name}: ${currentZips.length} → ${uniqueZipCodes.length} zip codes (${uniqueZipCodes.join(', ')})`);
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${district.district_name}:`, error);
      errors++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⚠️  Skipped: ${districts.length - updated - errors}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`\n✅ Done!`);
}

// Run the function
updateDistrictsZipCodes().catch(console.error);









