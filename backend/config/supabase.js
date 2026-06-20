const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL chưa được cấu hình trong .env');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình trong .env');
}

console.log('========== SUPABASE CONFIG ==========');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log(
  'SUPABASE_KEY:',
  process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...'
);
console.log('=====================================');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// Test kết nối khi server khởi động
(async () => {
  try {
    const { data, error } = await supabase.storage.listBuckets();

    console.log('========== SUPABASE BUCKETS ==========');

    if (error) {
      console.error('Bucket Error:', error);
    } else {
      console.log('Buckets:', data);
    }

    console.log('======================================');
  } catch (err) {
    console.error('Supabase Connection Error:', err);
  }
})();

module.exports = supabase;