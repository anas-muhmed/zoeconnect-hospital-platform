const http = require('http');

async function run() {
  console.log('--- Testing End-to-End Cloud Tenant Provisioning ---');

  const vendorApiUrl = 'http://localhost:4000/api';
  const hdspUrl = 'http://localhost:3000';
  const provisioningSecret = 'CHANGE_ME_STRONG_SECRET'; // Default from .env.example

  // 1. Login to Vendor Portal
  console.log('\n[1] Logging into Vendor Portal...');
  const loginRes = await fetch(`${vendorApiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Adminadmin@1' })
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed: ${await loginRes.text()}`);
  }
  const { accessToken } = await loginRes.json();
  console.log('✓ Logged in successfully');

  // 2. Call Provision Cloud Tenant
  const hospitalCode = 'TEST_CLOUD_002';
  console.log(`\n[2] Provisioning Cloud Tenant: ${hospitalCode}...`);
  const provisionRes = await fetch(`${vendorApiUrl}/hospitals/provision-cloud`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      hospitalName: 'Cloud Test Hospital',
      hospitalCode: hospitalCode,
      publicIp: 'localhost',
      publicPort: 3000,
      provisioningSecret: provisioningSecret
    })
  });

  if (!provisionRes.ok) {
    throw new Error(`Provisioning failed: ${await provisionRes.text()}`);
  }
  const provisionData = await provisionRes.json();
  console.log('✓ Provisioning API returned successfully:', provisionData);

  // 3. Verify HDSP Registration Status
  console.log('\n[3] Verifying Registration Status on HDSP Instance (waiting 1s for webhook to process)...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Need to log into HDSP first. Wait, /api/v1/license/status is Public!
  const statusRes = await fetch(`${hdspUrl}/api/v1/license/status`);
  if (!statusRes.ok) {
    throw new Error(`Failed to fetch HDSP license status: ${await statusRes.text()}`);
  }
  const statusData = await statusRes.json();
  console.log('✓ HDSP License Status:', statusData);

  if (statusData.hospitalCode === hospitalCode) {
    console.log('\n✅ End-to-End Provisioning Flow Successful!');
  } else {
    console.error('\n❌ Hospital code mismatch. Registration may have failed silently on HDSP side.');
  }
}

run().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
