import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SystemConfigService } from './system-config.service';

@UseGuards(JwtAuthGuard)
@Controller('system-config')
export class SystemConfigController {
  constructor(private svc: SystemConfigService) {}

  /** GET /system-config — returns all config keys (sensitive values masked for display) */
  @Get()
  async getAll() {
    const all = await this.svc.getAll();
    // Mask token values so they don't appear in full in the browser
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(all)) {
      masked[k] = k.includes('token') || k.includes('secret')
        ? v.length > 8 ? `${v.slice(0, 4)}${'*'.repeat(v.length - 8)}${v.slice(-4)}` : '****'
        : v;
    }
    return masked;
  }

  /** PATCH /system-config — upsert one or more keys */
  @Patch()
  async setBulk(@Body() body: Record<string, string>) {
    await this.svc.setBulk(body);
    return { ok: true };
  }
}
