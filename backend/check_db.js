require('dotenv').config();
const axios = require('axios');

async function check() {
  try {
    const url = process.env.SUPABASE_URL + '/rest/v1/specs?select=*';
    console.log('Fetching', url);
    const res = await axios.get(url, {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    console.log('SUCCESS! Table exists. Data:', res.data);
  } catch (err) {
    if (err.response) {
      console.error('ERROR from Supabase:', err.response.data);
    } else {
      console.error('Network Error:', err.message);
    }
  }
}
check();
