// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// 最新の publishable key を読み込んでクライアントを初期化
export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY
);
