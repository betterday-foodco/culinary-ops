import { Controller, Get, Header } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';

/**
 * Public read endpoint for site-wide facts (company email, phone, social URLs,
 * copyright, delivery schedule, etc.). No JWT required — this is what the
 * customer-facing marketing site fetches on every page load to render the
 * footer, contact details, and announcement banner.
 *
 * Security model: the `public.` prefix convention.
 *
 *   Only SystemConfig rows whose `key` starts with 'public.' are returned
 *   from this endpoint. The prefix is stripped in the response so the
 *   front-end works with clean keys (e.g. 'contact.email', not
 *   'public.contact.email').
 *
 *   Any key without the prefix — API secrets, webhook signing keys,
 *   internal thresholds — is invisible to this endpoint by design. To add
 *   a new public field, just save it in the DB with the 'public.' prefix.
 *   No code changes here.
 *
 * This lives in its own controller (separate from SystemConfigController)
 * so the class-level @UseGuards(JwtAuthGuard) on the private controller
 * can never accidentally be dropped from this one. Isolation beats vigilance.
 *
 * Seed values live in brand/site-info.seed.json and are loaded by
 * backend/prisma/seed.ts.
 */
@Controller('system-config/public')
export class SystemConfigPublicController {
  constructor(private svc: SystemConfigService) {}

  /** GET /api/system-config/public — public, no auth, only public.* keys */
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  async getPublic(): Promise<Record<string, string>> {
    const all = await this.svc.getAll();
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith('public.')) {
        out[key.slice('public.'.length)] = value;
      }
    }
    return out;
  }
}
