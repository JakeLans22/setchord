import { createClient } from "@supabase/supabase-js";

/* Use only the Supabase project's public publishable (or anon) key here. */
const SUPABASE_URL = "https://ofoprtfuovxmcsvkpyvn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_X4dYV5n4EDOVNbNT5yJZnA_OKEiKZcY";

const supabaseConfigured =
    SUPABASE_URL.startsWith("https://")
    && !SUPABASE_URL.includes("YOUR_SUPABASE")
    && SUPABASE_PUBLISHABLE_KEY.length > 20
    && !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SUPABASE");

window.supabaseClient = supabaseConfigured
    ? createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            }
        }
    )
    : null;
