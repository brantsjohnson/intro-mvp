// Supabase client for browser components
import { createBrowserClient } from '@supabase/ssr'
import { Database } from './database.types'

export const createClientComponentClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    const missingVars = []
    if (!supabaseUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!supabaseAnonKey) missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
      `Please ensure these are set in your .env.local file and restart your Next.js dev server.\n` +
      `Current values: URL=${supabaseUrl ? 'set' : 'missing'}, KEY=${supabaseAnonKey ? 'set' : 'missing'}`
    )
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
}