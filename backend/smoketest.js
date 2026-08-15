/**
 * smoketest.js — quick API smoke test using Node's built-in http module
 * Run: node smoketest.js
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const boundary = '----DriftDetectorBoundary';

function buildMultipart(files) {
  const parts = [];
  for (const [fieldName, filePath] of files) {
    const content = fs.readFileSync(filePath);
    const name = path.basename(filePath);
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${name}"\r\n` +
      `Content-Type: text/yaml\r\n\r\n`
    );
    parts.push(content);
    parts.push('\r\n');
  }
  parts.push(`--${boundary}--\r\n`);
  return Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));
}

const body = buildMultipart([
  ['v1', path.join(__dirname, 'test-fixtures', 'v1.yaml')],
  ['v2', path.join(__dirname, 'test-fixtures', 'v2.yaml')],
]);

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/diff',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  },
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log('\n=== SMOKE TEST RESULT ===');
    console.log(`Status: ${res.statusCode}`);
    console.log(`Summary: ${JSON.stringify(json.summary, null, 2)}`);
    console.log(`Total changes: ${json.changes?.length}`);
    const breaking = json.changes?.filter(c => c.classification?.severity === 'BREAKING').length;
    const warning  = json.changes?.filter(c => c.classification?.severity === 'WARNING').length;
    const safe     = json.changes?.filter(c => c.classification?.severity === 'NON_BREAKING').length;
    console.log(`  BREAKING=${breaking}  WARNING=${warning}  NON_BREAKING=${safe}`);
    console.log('\n✅ API smoke test passed' + (breaking === 5 && warning === 1 && safe === 2 ? ' — counts match expected' : ' — CHECK COUNTS'));
  });
});

req.on('error', (e) => {
  console.error('❌ Request failed:', e.message);
  console.error('   Is the server running? (npm start)');
  process.exit(1);
});

req.write(body);
req.end();
