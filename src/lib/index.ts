import type { Db } from './db'
import { SupabaseDb } from './supabaseDb'
import { DemoDb } from './demo/demoDb'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const demoFlag = String(import.meta.env.VITE_DEMO ?? '').toLowerCase() === 'true'

export const configurado = Boolean(url && key && !url.includes('SEU-PROJETO'))
export const modoDemo = demoFlag || !configurado

export const db: Db = modoDemo ? new DemoDb() : new SupabaseDb(url!, key!)
