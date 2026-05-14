import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vmtddslnzfytlktoosug.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtdGRkc2xuenZ5dGxrdG9vc3VtZyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzQ3MjI4MDM5LCJleHAiOjIwNjI4MDQwMzl9.N5Lg-2g9x7vQ1q-1xP9-8fVw4L8g-v4Z2k6wD4hY4lE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
