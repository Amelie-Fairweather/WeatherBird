import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // During build time, if env vars aren't set, create a mock client that throws helpful errors
    // This allows the build to complete, but runtime calls will fail with a clear message
    throw new Error('Supabase environment variables are not set. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your Vercel environment variables.');
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseInstance;
}

// Create a proxy that lazily initializes the client
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    try {
      const client = getSupabaseClient();
      const value = client[prop as keyof SupabaseClient];
      if (typeof value === 'function') {
        return value.bind(client);
      }
      return value;
    } catch (error) {
      // If Supabase isn't configured, return a mock that throws helpful errors
      if (prop === 'from') {
        return () => ({
          select: () => ({ data: null, error: error as Error }),
          insert: () => ({ data: null, error: error as Error }),
          update: () => ({ data: null, error: error as Error }),
          delete: () => ({ data: null, error: error as Error }),
        });
      }
      throw error;
    }
  }
});


