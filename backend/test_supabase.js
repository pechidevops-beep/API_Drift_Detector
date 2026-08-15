require('dotenv').config();
const supabase = require('./store/supabase');

async function test() {
  const { data, error } = await supabase.from('diff_runs').select('*').limit(1);
  if (error) {
    console.error('Error fetching diff_runs:', error);
  } else {
    console.log('Success! Data:', data);
  }
}
test();
