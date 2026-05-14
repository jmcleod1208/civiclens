import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _admin: SupabaseClient | undefined

/**
 * Returns a singleton Supabase client configured with the service-role key.
 * The service-role key bypasses Row Level Security and can call admin auth
 * methods (createUser, deleteUser, etc.).
 *
 * Never expose this client or its key to the browser.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }

  _admin = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return _admin
}
