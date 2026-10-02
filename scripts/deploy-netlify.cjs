const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

console.log('Compiling fresh production zip...');
execSync('powershell -Command "Compress-Archive -Path frontend\\dist\\* -DestinationPath frontend-dist.zip -Force"');

const token = 'nfc_nEGe3w4B5oPcgX6PBSvWUqMrgefMCGtu8361';
const siteId = 'c3d010c5-8157-4497-a601-586919a82e2b';
const zipBuffer = fs.readFileSync('frontend-dist.zip');

console.log(`Deploying ${zipBuffer.length} bytes to Netlify...`);

const req = https.request('https://api.netlify.com/api/v1/sites/' + siteId + '/deploys', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/zip',
    'Content-Length': zipBuffer.length,
    'User-Agent': 'Node-Netlify-Deployer'
  }
}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      console.log('NETLIFY DEPLOY SUCCESS:', res.statusCode, data.state, data.ssl_url);
    } catch {
      console.log('RAW RESPONSE:', body);
    }
    fs.unlinkSync('frontend-dist.zip');
  });
});

req.on('error', err => {
  console.error('Upload Error:', err);
  if (fs.existsSync('frontend-dist.zip')) fs.unlinkSync('frontend-dist.zip');
});

req.write(zipBuffer);
req.end();
