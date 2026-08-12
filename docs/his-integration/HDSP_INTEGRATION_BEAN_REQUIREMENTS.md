# Obsolete: no HIS-side bean is required

This document previously specified a required `hdspIntegration` managed bean
(`enabled` / `branchId` / `accessToken` properties) that the HIS server would
need to implement to bootstrap the HDSP Registration widget.

That design has been superseded. As of the current integration
(`PatientRegistration_HDSP.xhtml`, cookie-based widget bootstrap), **no HIS
backend code of any kind is required** — no managed bean, no servlet filter,
no REST endpoint, no per-site credential.

The widget now bootstraps itself entirely on the HDSP side:

- The iframe is embedded with a static, zero-parameter `src`
  (`/hdsp/widget/registration`) — no `branchId`, no `token`, no query string
  carrying any credential.
- On load, the widget calls HDSP's own `GET /api/v1/auth/widget-bootstrap`,
  which reads a first-party httpOnly session cookie (same-origin via the
  Nginx `/hdsp/` proxy) and returns a short-lived access token.
- If no valid cookie exists yet (first use on this terminal, or after the
  cookie's lifetime has elapsed), the widget renders its own login form
  (`POST /api/v1/auth/widget-login`) — the receptionist signs in with their
  own HDSP account, entirely inside the iframe. HIS never sees or handles
  these credentials.
- Session renewal (`widget-bootstrap` called every 8 minutes) and idle
  timeout are enforced entirely by HDSP, reusing the same refresh-token
  logic as the main HDSP application.

See `frontend/src/lib/hooks/useWidgetAuth.ts`, `frontend/src/lib/api/widget-client.ts`,
and `backend/src/modules/auth/auth.controller.ts` (`widget-login` /
`widget-bootstrap` / `widget-logout`) for the current implementation.

This file is kept only so the earlier design isn't lost from history; it
should not be used as a basis for any new HIS-side work.
