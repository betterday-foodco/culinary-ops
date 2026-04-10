# Site Data API — Contract for culinary-ops backend

**Status:** Not yet implemented. This document defines the endpoint
`betterday-webapp` will fetch from once it's live.

**Owner on culinary-ops side:** Gurleen (and/or Conner via PR into `conner/`)

**Consumer:** `betterday-webapp/app/shared/site-shell.js` — today it fetches
from a local `site-data.json` stub. When this endpoint ships, flipping one
line of config points every marketing page at the live data.

---

## Why this exists

Site-wide facts (company email, phone, social URLs, copyright, city/province,
delivery schedule) should be editable **without touching code or redeploying
HTML**. The culinary-ops admin dashboard already has a `SystemConfig` table
and an internal PATCH endpoint, which is exactly the right storage. This
spec adds the **public read path** that the customer-facing front-end can hit.

---

## The endpoint

### `GET /api/system-config/public`

- **Auth:** public (no JWT required)
- **CORS:** must allow requests from the marketing web origin
  (`https://betterday-webapp.onrender.com`, eventually `https://eatbetterday.ca`)
- **Caching:** `Cache-Control: public, max-age=300` (5 min) is a reasonable
  default — edits propagate within 5 min, and we don't hammer the DB
- **Rate limit:** low (this endpoint should be called ~1×/page load, cached)

### Response shape

Flat key/value object. Keys are the `SystemConfig.key` values with the
`public.` prefix **stripped** before being returned to the client:

```json
{
  "company.legalName":    "BetterDay Food Co.",
  "company.displayName":  "BetterDay",
  "company.city":         "Calgary",
  "company.province":     "AB",

  "contact.email":        "hello@eatbetterday.ca",
  "contact.phone":        "(403) 371-2258",
  "contact.phoneRaw":     "+14033712258",

  "social.instagram":     "https://www.instagram.com/betterdayfood/",
  "social.facebook":      "https://www.facebook.com/betterdayfood",

  "legal.copyrightYear":  "2026",
  "legal.copyrightText":  "© 2026 BetterDay Food Co.",

  "delivery.areas":       "Calgary & surrounding",
  "delivery.schedule":    "Every Sunday"
}
```

The exact current set of keys lives in
`betterday-webapp/app/shared/site-data.json` — the local stub is the
**source of truth for the initial seed values**. Adding new keys is safe;
the front-end reads whatever comes back.

---

## Security model: the `public.` prefix convention

The front-end must **never** see keys that aren't explicitly marked public.
Without this filter, a future config entry like
`system_config.key = "resend_api_key"` would leak to any browser on the
internet.

**Rule:** only `SystemConfig` rows whose `key` begins with `public.` are
returned from this endpoint. The prefix is stripped in the response so
the front-end works with clean keys (`contact.email`, not `public.contact.email`).

This means in the database:

| `key` (in DB)               | `value`                | Exposed by `/public`? |
|-----------------------------|------------------------|-----------------------|
| `public.contact.email`      | `hello@eatbetterday.ca`| ✅ yes (as `contact.email`) |
| `public.social.instagram`   | `https://...`          | ✅ yes |
| `resend_api_key`            | `re_xxx...`            | ❌ no — no `public.` prefix |
| `shopify_webhook_secret`    | `whsec_...`            | ❌ no |
| `admin.internal.threshold`  | `42`                   | ❌ no |

Admins can add new public keys anytime by saving them in the existing
`PATCH /api/system-config` endpoint with the `public.` prefix. No code
changes needed on the backend to expose new fields — the filter handles it
automatically.

---

## Backend implementation (NestJS)

Three small changes to `culinary-ops/backend`:

### 1. Add the public endpoint

File: `backend/src/modules/system-config/system-config.controller.ts`

The controller currently has `@UseGuards(JwtAuthGuard)` at the class level,
which guards both `GET /` and `PATCH /`. We need one route that bypasses
the guard. Cleanest options:

**Option A — separate public controller** (recommended, keeps concerns clean):

```ts
// backend/src/modules/system-config/system-config-public.controller.ts
import { Controller, Get, Header } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';

@Controller('system-config/public')
export class SystemConfigPublicController {
  constructor(private svc: SystemConfigService) {}

  /** GET /api/system-config/public — public, no auth, only public.* keys */
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  async getPublic() {
    const all = await this.svc.getAll();
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith('public.')) out[k.slice(7)] = v;
    }
    return out;
  }
}
```

Register it in `system-config.module.ts`:

```ts
@Module({
  controllers: [SystemConfigController, SystemConfigPublicController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
```

**Option B — same controller, per-route guard:**

Remove the class-level `@UseGuards` and add it to only the private routes:

```ts
@Controller('system-config')
export class SystemConfigController {
  constructor(private svc: SystemConfigService) {}

  /** public, no auth */
  @Get('public')
  @Header('Cache-Control', 'public, max-age=300')
  async getPublic() { /* same as above */ }

  /** private, JWT required */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getAll() { /* existing logic */ }

  @Patch()
  @UseGuards(JwtAuthGuard)
  async setBulk(@Body() body: Record<string, string>) { /* existing logic */ }
}
```

Either works. Option A is slightly less risky because there's no way to
accidentally drop the guard from a sensitive route by editing the wrong
decorator.

### 2. Update CORS to allow the marketing origin

File: `backend/src/main.ts`

Current config only accepts one `FRONTEND_URL`. Change it to accept a
comma-separated list so multiple front-ends can talk to the same API:

```ts
app.enableCors({
  origin: (origin, callback) => {
    const allowed = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const isLocalhost = origin && /^http:\/\/localhost:\d+$/.test(origin);
    const isAllowed = !origin || isLocalhost || allowed.includes(origin);

    callback(isAllowed ? null : new Error('Not allowed by CORS'), isAllowed);
  },
  credentials: true,
});
```

Then in the Render dashboard, set on `culinary-ops-api`:

```
FRONTEND_URLS = https://culinary-ops-frontend.onrender.com,https://betterday-webapp.onrender.com
```

(Eventually add the real domains: `https://eatbetterday.ca`, `https://app.eatbetterday.ca`, etc.)

### 3. Seed the initial `public.*` keys

Two options:

**Option A — via the admin UI.** Log in, go to System Config, PATCH these
keys one by one (or paste the whole JSON body):

```json
{
  "public.company.legalName":    "BetterDay Food Co.",
  "public.company.displayName":  "BetterDay",
  "public.company.city":         "Calgary",
  "public.company.province":     "AB",
  "public.contact.email":        "hello@eatbetterday.ca",
  "public.contact.phone":        "(403) 371-2258",
  "public.contact.phoneRaw":     "+14033712258",
  "public.social.instagram":     "https://www.instagram.com/betterdayfood/",
  "public.social.facebook":      "https://www.facebook.com/betterdayfood",
  "public.legal.copyrightYear":  "2026",
  "public.legal.copyrightText":  "© 2026 BetterDay Food Co.",
  "public.delivery.areas":       "Calgary & surrounding",
  "public.delivery.schedule":    "Every Sunday"
}
```

**Option B — Prisma seed script.** Add to `backend/prisma/seed.ts` (or
whichever seed file exists). One-time idempotent upsert on next
`npx prisma db seed`.

Either path is fine — Option A is faster if the admin UI already renders
the SystemConfig table for editing.

---

## Verification / acceptance criteria

After implementation, these should all pass from any browser:

```bash
# 1. Endpoint returns JSON with no auth
curl https://culinary-ops-api.onrender.com/api/system-config/public
# → { "contact.email": "hello@eatbetterday.ca", ... }

# 2. Non-public keys are NOT leaked
curl https://culinary-ops-api.onrender.com/api/system-config/public | jq 'keys[]' | grep -i "secret\|token\|key"
# → should print nothing

# 3. CORS allows the marketing origin
curl -H "Origin: https://betterday-webapp.onrender.com" \
     -I https://culinary-ops-api.onrender.com/api/system-config/public
# → response includes: Access-Control-Allow-Origin: https://betterday-webapp.onrender.com

# 4. Private endpoint still requires JWT
curl https://culinary-ops-api.onrender.com/api/system-config
# → 401 Unauthorized
```

## What the front-end does when this ships

In `betterday-webapp`, add one line to each page that uses the shell:

```html
<script>window.BETTERDAY_API_BASE = 'https://culinary-ops-api.onrender.com/api';</script>
<script src="shared/site-shell.js" defer></script>
```

`site-shell.js` already has the switching logic — it'll fetch from the API
instead of the local JSON file. See `site-shell.js` lines 62-66
(`SITE_DATA_URL` constant) for the exact behaviour.

At that point, `betterday-webapp/app/shared/site-data.json` can be deleted
(or kept as a dev-only fallback).

---

## Questions / open points

- **Domain + env var naming.** Should the env var be `FRONTEND_URLS`
  (plural) replacing `FRONTEND_URL`, or `MARKETING_FRONTEND_URL` added
  alongside? Either works — whatever Gurleen prefers.
- **Cache TTL.** 5 minutes is an initial guess. If edits need to propagate
  faster, shorten to 60s. If DB load is a concern, lengthen to 30min. Can
  tune later.
- **Sensitive-key guard.** The `public.` prefix convention relies on
  discipline when adding new keys. Worth considering a unit test that
  asserts no `SystemConfig` key matching `/secret|token|password|api_key/i`
  has a `public.` prefix — cheap insurance.
- **Versioning.** This endpoint is v1 of a likely larger `/api/site/*` or
  `/api/public/*` namespace. Probably fine to keep as `/system-config/public`
  for now; if the public surface grows, revisit.
