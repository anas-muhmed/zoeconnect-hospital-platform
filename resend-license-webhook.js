/**
 * resend-license-webhook.js
 * Re-delivers the approved license webhook from vendor → HDSP.
 * Run after restarting the HDSP backend:
 *   node D:\HDSP\resend-license-webhook.js
 */

const { Client } = require('D:/HDSP/vendor-portal/backend/node_modules/pg');
const crypto = require('crypto');

async function main() {
  // ── Connect to vendor DB ──────────────────────────────────────────────────
  const vendorDb = new Client({
    host: 'localhost',
    port: 5433,
    user: 'vendor_app',
    password: 'vendor_secret',
    database: 'vendor_db',
  });
  await vendorDb.connect();

  // ── Fetch latest active issued license + hospital webhook info ────────────
  const { rows } = await vendorDb.query(`
    SELECT
      il.id            AS license_id,
      il.request_id,
      il.signed_payload,
      h.webhook_url,
      h.instance_secret AS webhook_secret,
      h.hospital_code
    FROM issued_licenses il
    JOIN hospitals h ON h.id = il.hospital_id
    WHERE il.status = 'ACTIVE'
    ORDER BY il.issued_at DESC
    LIMIT 1
  `);

  await vendorDb.end();

  if (rows.length === 0) {
    console.error('❌  No active issued license found in vendor DB');
    process.exit(1);
  }

  const { license_id, request_id, signed_payload, webhook_url, webhook_secret, hospital_code } = rows[0];
  console.log(`✓  Found license for hospital: ${hospital_code}`);
  console.log(`   Webhook URL: ${webhook_url}`);
  console.log(`   License ID:  ${license_id}`);

  // ── Build the webhook payload ─────────────────────────────────────────────
  const payload = {
    type:            'LICENSE_APPROVED',
    vendorRequestId: request_id,
    signedLicense:   signed_payload,
  };
  const body = JSON.stringify(payload);

  // ── Compute HMAC-SHA256 signature ─────────────────────────────────────────
  const signature = `sha256=${crypto.createHmac('sha256', webhook_secret).update(body).digest('hex')}`;

  // ── POST to HDSP webhook endpoint ─────────────────────────────────────────
  console.log('\n→  Sending LICENSE_APPROVED webhook to HDSP...');
  const res = await fetch(webhook_url, {
    method:  'POST',
    headers: {
      'Content-Type':       'application/json',
      'X-Vendor-Signature': signature,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  const responseText = await res.text();
  if (res.ok) {
    console.log(`✅  Webhook delivered! Status ${res.status}`);
    console.log('   Response:', responseText);
    console.log('\nRefresh HDSP Settings → License — it should now show "License Auto-Activated" (Step 3).');
  } else {
    console.error(`❌  Webhook failed. Status ${res.status}`);
    console.error('   Response:', responseText);
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
