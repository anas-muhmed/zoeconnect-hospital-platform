import { test as setup, expect } from '@playwright/test';
import path from 'path';

// ZoeConnect Identity Architecture Migration, Phase 7 (final frontend
// authentication phase): subdomains are no longer part of the platform's
// identity/routing model -- every organization is reached at the same
// shared login URL, and the JWT (not the Host header) carries organization
// context once authenticated (Phase 5). The "tenant_b_user" persona
// previously logged in via a distinct subdomain
// (http://tenant-b.localtest.me:3000/login) to exercise a *different*
// tenant/organization than the other personas; that's still a legitimate
// thing to test, but it's no longer done by navigating to a different
// subdomain -- it's just a different account (globally unique username),
// logged in at the same shared URL as everyone else.
const personas = [
  { username: 'admin', password: 'password', file: '../.auth/admin.json' },
  { username: 'reporter', password: 'password', file: '../.auth/reporter.json' },
  { username: 'investigator', password: 'password', file: '../.auth/investigator.json' },
  { username: 'qm', password: 'password', file: '../.auth/qm.json' },
  { username: 'tenant_b_user', password: 'password', file: '../.auth/tenant_b_user.json' }
];

for (const persona of personas) {
  setup(`authenticate as ${persona.username}`, async ({ page }) => {
    await page.goto('/login');
    // The login field is internally named `identifier` (Phase 7) -- it
    // accepts either a username or an email address.
    await page.fill('input[name="identifier"]', persona.username);
    await page.fill('input[name="password"]', persona.password);

    await page.click('button[type="submit"]');

    // Wait for successful login (usually redirects to dashboard or home)
    await page.waitForURL('**/*dashboard*'); // adjust depending on app behavior
    
    // Save state
    await page.context().storageState({ path: path.join(__dirname, persona.file) });

    // Playwright doesn't save sessionStorage, so save it manually
    const sessionData = await page.evaluate(() => JSON.stringify(sessionStorage));
    require('fs').writeFileSync(path.join(__dirname, persona.file.replace('.json', '-session.json')), sessionData);
  });
}
