import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://avxxwwlfhphdcsswzzpl.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl) {
  console.warn('Supabase URL is missing. Check your environment settings.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
