#!/usr/bin/env ts-node
/**
 * HDSP License Generator — Offline Tool (run on VENDOR machine only)
 *
 * Usage:
 *   npx ts-node scripts/generate-license.ts keygen          # Generate RSA key pair
 *   npx ts-node scripts/generate-license.ts issue           # Issue a new license (interactive)
 *   npx ts-node scripts/generate-license.ts fingerprint     # Print this machine's fingerprint
 *   npx ts-node scripts/generate-license.ts verify <file>   # Verify a license file
 *
 * Key files (NEVER commit private key):
 *   keys/license-private.pem  — kept by vendor, used to sign
 *   keys/license-public.pem   — shipped inside the application
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

const KEYS_DIR = path.join(__dirname, '..', 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'license-private.pem');
const PUBLIC_KEY_PATH  = path.join(KEYS_DIR, 'license-public.pem');

// ── Types ─────────────────────────────────────────────────────────────────────
export type LicenseModule = 'PLATFORM' | 'LOYALTY' | 'FORMS' | 'QUEUE' | 'FEEDBACK' | 'EIC' | 'ATTENDANCE' | 'CMS';

export interface LicensePayload {
  licenseKey: string;
  hospitalName: string;
  hospitalCode: string;
  issuedAt: string;       // ISO 8601
  expiresAt: string | null; // null = perpetual
  modules: LicenseModule[];
  maxUsers: number;
  machineFingerprint: string | null; // null = any machine
}

export interface SignedLicense extends LicensePayload {
  signature: string;      // base64 RSA-SHA256 signature over canonical payload
}

// ── Machine Fingerprint ───────────────────────────────────────────────────────
export function getMachineFingerprint(): string {
  const hostname = os.hostname();
  const macs: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface ?? []) {
      if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
        macs.push(addr.mac);
      }
    }
  }
  macs.sort();
  const raw = `${hostname}:${macs.join(',')}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// ── Canonical payload (deterministic JSON for signing) ────────────────────────
function canonicalize(payload: LicensePayload): string {
  const keys: (keyof LicensePayload)[] = [
    'licenseKey','hospitalName','hospitalCode',
    'issuedAt','expiresAt','modules','maxUsers','machineFingerprint',
  ];
  const obj: Record<string, unknown> = {};
  for (const k of keys) obj[k] = payload[k];
  return JSON.stringify(obj);
}

// ── Sign ──────────────────────────────────────────────────────────────────────
function sign(payload: LicensePayload, privateKeyPem: string): SignedLicense {
  const canonical = canonicalize(payload);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(canonical);
  const signature = signer.sign(privateKeyPem, 'base64');
  return { ...payload, signature };
}

// ── Verify ────────────────────────────────────────────────────────────────────
export function verify(license: SignedLicense, publicKeyPem: string): boolean {
  const { signature, ...payload } = license;
  const canonical = canonicalize(payload as LicensePayload);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(canonical);
  return verifier.verify(publicKeyPem, signature, 'base64');
}

// ── CLI commands ──────────────────────────────────────────────────────────────
async function cmdKeygen() {
  fs.mkdirSync(KEYS_DIR, { recursive: true });

  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('❌  Key pair already exists. Delete keys/ directory to regenerate.');
    process.exit(1);
  }

  console.log('Generating RSA-2048 key pair…');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY_PATH,  publicKey,  { mode: 0o644 });

  console.log('✅  Keys written:');
  console.log(`    Private: ${PRIVATE_KEY_PATH}  (KEEP SECRET — do NOT commit)`);
  console.log(`    Public:  ${PUBLIC_KEY_PATH}   (ship inside the application)`);
  console.log('\nCopy the public key content into:');
  console.log('  backend/src/modules/licensing/license.public.pem');
}

async function cmdFingerprint() {
  const fp = getMachineFingerprint();
  console.log('Machine fingerprint:', fp);
  console.log('(Provide this to the vendor when requesting a machine-locked license)');
}

async function cmdIssue() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('❌  Private key not found. Run: npx ts-node scripts/generate-license.ts keygen');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

  console.log('\n── HDSP License Issuance ──────────────────────────────────\n');

  const hospitalName = await ask('Hospital name: ');
  const hospitalCode = await ask('Hospital code (short, e.g. CGHS-DEL): ');
  const maxUsersStr  = await ask('Max platform users [50]: ');
  const maxUsers     = parseInt(maxUsersStr || '50', 10);

  // Keep in sync with the canonical ALL_MODULE_CODES list in
  // backend/src/modules/licensing/license.service.ts -- this prompt is free
  // text (not validated against the type below), so a stale hint here is how
  // a real issued license silently ends up missing a module: the operator
  // only has this printed list to go by when typing modules.
  console.log('\nAvailable modules: PLATFORM, LOYALTY, FORMS, QUEUE, FEEDBACK, EIC, ATTENDANCE, CMS');
  const modulesStr   = await ask('Modules (comma-separated) [PLATFORM,LOYALTY]: ');
  const modules      = (modulesStr || 'PLATFORM,LOYALTY')
    .split(',')
    .map((m) => m.trim().toUpperCase()) as LicenseModule[];

  const expiresInDays = await ask('Validity in days (blank = perpetual): ');
  const expiresAt = expiresInDays
    ? new Date(Date.now() + parseInt(expiresInDays, 10) * 86_400_000).toISOString()
    : null;

  const fpChoice = await ask('Lock to specific machine? Enter fingerprint or leave blank: ');
  const machineFingerprint = fpChoice.trim() || null;

  rl.close();

  const payload: LicensePayload = {
    licenseKey: crypto.randomUUID(),
    hospitalName: hospitalName.trim(),
    hospitalCode: hospitalCode.trim().toUpperCase(),
    issuedAt: new Date().toISOString(),
    expiresAt,
    modules,
    maxUsers,
    machineFingerprint,
  };

  const privateKeyPem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const license = sign(payload, privateKeyPem);
  const outPath = path.join(KEYS_DIR, `license-${payload.hospitalCode}-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(license, null, 2));

  console.log('\n✅  License issued:');
  console.log(`    File:    ${outPath}`);
  console.log(`    Key:     ${license.licenseKey}`);
  console.log(`    Modules: ${modules.join(', ')}`);
  console.log(`    Expires: ${expiresAt ?? 'PERPETUAL'}`);
  console.log(`    Machine: ${machineFingerprint ?? 'ANY'}`);
  console.log('\nDeliver this JSON file to the customer for upload in HDSP → Settings → License.');
}

async function cmdVerify(filePath: string) {
  if (!fs.existsSync(PUBLIC_KEY_PATH)) {
    console.error('❌  Public key not found.');
    process.exit(1);
  }
  const license: SignedLicense = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const publicKeyPem = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
  const valid = verify(license, publicKeyPem);
  if (valid) {
    console.log('✅  Signature VALID');
    console.log(JSON.stringify(license, null, 2));
  } else {
    console.error('❌  Signature INVALID — license file may be tampered');
    process.exit(1);
  }
}

// ── Entry ─────────────────────────────────────────────────────────────────────
(async () => {
  const [,, cmd, ...args] = process.argv;
  switch (cmd) {
    case 'keygen':      await cmdKeygen(); break;
    case 'fingerprint': await cmdFingerprint(); break;
    case 'issue':       await cmdIssue(); break;
    case 'verify':      await cmdVerify(args[0]); break;
    default:
      console.log('Usage: npx ts-node scripts/generate-license.ts <keygen|fingerprint|issue|verify> [file]');
  }
})();
