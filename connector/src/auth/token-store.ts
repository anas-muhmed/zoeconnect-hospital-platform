import type { ConnectorCredentials } from './registration';
import { refreshConnectorToken } from './registration';
import { SecureJsonStore } from '../security/secure-json-store';

/**
 * Local encrypted-at-rest credential storage (HDSP Connector, Phase A --
 * 2026-07-21; migrated onto `SecureJsonStore`/DPAPI as a release-blocker
 * fix ahead of v1.0.0, 2026-07-22 -- see
 * `HDSP_CONNECTOR_OPERATIONAL_WORKFLOW_REVIEW.md` §11).
 *
 * PRIOR IMPLEMENTATION (superseded): this file used to do its own
 * hand-rolled AES-256-GCM encryption with the key stored in a sibling
 * `store.key` file -- the same fallback shape `SecureJsonStore` still
 * uses on non-Windows platforms, but without ever picking up DPAPI on
 * Windows the way `OracleConfigStore` did once Task #103 built
 * `SecureJsonStore`. That meant the Connector's own cloud identity (a
 * 30-day-lived refresh token, arguably the more sensitive of the two
 * secrets this product stores, since it grants live query access to the
 * hospital's data through an activated Connector) was protected less
 * than Oracle credentials were -- flagged explicitly in the operational
 * review as an inconsistency worth fixing before v1.0.0, not after.
 *
 * This is now a thin wrapper around `SecureJsonStore<ConnectorCredentials>`
 * -- same DPAPI-on-Windows / AES-256-GCM-fallback-elsewhere behavior
 * `OracleConfigStore` already has, no new crypto code to review. There is
 * no migration path for a credentials file written by the old format
 * (`{iv, authTag, ciphertext}` with no `backend` field) -- per the same
 * reasoning already applied to the local API's v1 versioning and the
 * package version bump: nothing has shipped to a real hospital yet, so
 * there is no live old-format file anywhere to preserve compatibility
 * with. A Connector that happens to have been activated against a
 * pre-this-change build in a dev/test environment will need to
 * re-activate once after upgrading past this change; that is the correct
 * and only expected behavior, not a bug.
 */
export class TokenStore {
  private readonly store: SecureJsonStore<ConnectorCredentials>;

  constructor(dir?: string) {
    this.store = new SecureJsonStore<ConnectorCredentials>(
      dir ?? defaultConfigDir(),
      'credentials.enc.json',
    );
  }

  save(credentials: ConnectorCredentials): void {
    this.store.save(credentials);
  }

  load(): ConnectorCredentials | null {
    return this.store.load();
  }

  clear(): void {
    this.store.clear();
  }

  /**
   * Refreshes against the cloud and persists the result. Throws (does not
   * silently swallow) a refresh failure -- the caller decides whether that
   * means "credentials revoked, stop retrying" or "transient network
   * failure, retry with backoff" (see `registration.ts`'s doc comment on
   * why retry policy lives at the caller, not inside the HTTP call
   * itself).
   */
  async refreshAndPersist(cloudUrl: string): Promise<ConnectorCredentials> {
    const current = this.load();
    if (!current) {
      throw new Error('No stored connector credentials to refresh -- run registration first');
    }
    const fresh = await refreshConnectorToken(cloudUrl, current.refreshToken);
    this.save(fresh);
    return fresh;
  }
}

function defaultConfigDir(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  return process.env.CONNECTOR_CONFIG_DIR
    || (process.platform === 'win32'
      ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'HDSP', 'Connector')
      : '/etc/hdsp-connector');
}
