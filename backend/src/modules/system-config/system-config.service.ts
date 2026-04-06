import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SystemConfigService {
  constructor(private prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemConfig.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async setBulk(data: Record<string, string>): Promise<void> {
    await Promise.all(Object.entries(data).map(([k, v]) => this.set(k, v)));
  }
}
