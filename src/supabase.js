import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iakzwvrwcfhgyooiwrpf.supabase.co'

const supabaseKey = 'sb_publishable_hCqv7QSpiDbAIKdeUZ_kyw_o0I6ZDIA'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)