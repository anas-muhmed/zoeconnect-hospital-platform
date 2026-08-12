import { execFileSync } from 'child_process';

/**
 * Windows DPAPI wrapper (Task #103, "HDSP Connector Manager," 2026-07-22).
 *
 * The explicit requirement for this task is: Oracle credentials entered
 * into the Connector Manager UI must not be stored in plain JSON or
 * `.env` -- use the Windows credential store or DPAPI. This wraps
 * `System.Security.Cryptography.ProtectedData` (DPAPI) via a `powershell.exe`
 * child process rather than a native npm addon (`keytar` et al.) -- same
 * reasoning `token-store.ts` already documented for why it avoided a
 * native dependency: no Windows machine in this sandbox to verify a
 * native module actually builds/links there, and PowerShell (hence
 * `System.Security.Cryptography`) ships with every supported Windows
 * version, so this has zero extra install footprint on the target
 * platform. This is REAL DPAPI, not a workaround -- `ProtectedData` is the
 * same OS primitive `keytar`/Credential Manager ultimately call into.
 *
 * Scope: `CurrentUser` (`DataProtectionScope.CurrentUser`). The Connector
 * Windows Service is expected to run under a fixed service account (by
 * default, `LocalSystem` when installed via `node-windows` -- task #95,
 * not yet built) -- DPAPI's CurrentUser scope ties the encryption key to
 * that account's profile, which is stable and consistent as long as the
 * SAME account always both encrypts and decrypts (true here: only the
 * Connector Service process ever touches this store). `LocalMachine`
 * scope was deliberately not chosen -- it would let ANY process on the
 * machine decrypt the data, which is a strictly weaker guarantee for a
 * credential that only this one service ever needs to read.
 *
 * Every function here is synchronous (`execFileSync`) -- this only runs
 * during Oracle-config save (a rare, user-initiated action from the
 * Manager UI, not a hot path), so a blocking child-process call is an
 * acceptable simplicity trade-off, matching `TokenStore`'s existing
 * synchronous `fs` calls in the same file family.
 */

export function isDpapiAvailable(): boolean {
  return process.platform === 'win32';
}

function runPowerShell(script: string): string {
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', windowsHide: true },
  ).trim();
}

/** Encrypts `plaintext` via DPAPI (CurrentUser scope), returns base64 ciphertext. Windows-only -- throws if called elsewhere (callers must check `isDpapiAvailable()` first). */
export function dpapiProtect(plaintext: Buffer): string {
  if (!isDpapiAvailable()) {
    throw new Error('DPAPI is only available on win32');
  }
  const plaintextB64 = plaintext.toString('base64');
  const script = `
    Add-Type -AssemblyName System.Security;
    $bytes = [Convert]::FromBase64String('${plaintextB64}');
    $protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);
    [Convert]::ToBase64String($protected);
  `;
  return runPowerShell(script);
}

/** Decrypts base64 DPAPI ciphertext (as produced by `dpapiProtect()`) back to the original plaintext bytes. */
export function dpapiUnprotect(ciphertextB64: string): Buffer {
  if (!isDpapiAvailable()) {
    throw new Error('DPAPI is only available on win32');
  }
  const script = `
    Add-Type -AssemblyName System.Security;
    $bytes = [Convert]::FromBase64String('${ciphertextB64}');
    $unprotected = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);
    [Convert]::ToBase64String($unprotected);
  `;
  return Buffer.from(runPowerShell(script), 'base64');
}
