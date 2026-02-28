import { NextResponse } from 'next/server';
// Diagnostic endpoint to check configuration
export async function GET() {
  const checks = {
    weatherApiKey: !!process.env.WEATHER_API_KEY,
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  const allGood = Object.values(checks).every(v => v === true);

  return NextResponse.json({
    status: allGood ? 'ok' : 'missing_config',
    checks,
    message: allGood 
      ? 'All environment variables are set!' 
      : 'Some environment variables are missing. Check your .env.local file.',
  });
}


