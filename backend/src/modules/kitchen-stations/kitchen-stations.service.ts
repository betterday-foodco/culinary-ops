import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class KitchenStationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.kitchenStation.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
  }

  create(data: { name: string; sort_order?: number }) {
    return this.prisma.kitchenStation.create({ data });
  }

  update(id: string, data: Partial<{ name: string; sort_order: number; is_active: boolean }>) {
    return this.prisma.kitchenStation.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.kitchenStation.update({ where: { id }, data: { is_active: false } });
  }

  async seed() {
    const count = await this.prisma.kitchenStation.count();
    if (count > 0) return { message: 'Already seeded' };
    const stations = [
      { name: 'Veg Station', sort_order: 1 },
      { name: 'Protein Station', sort_order: 2 },
      { name: 'Sauce Station', sort_order: 3 },
      { name: 'Oven Station', sort_order: 4 },
      { name: 'Breakfast + Sides Station', sort_order: 5 },
      { name: 'Packaging Station', sort_order: 6 },
    ];
    await this.prisma.kitchenStation.createMany({ data: stations });
    return { message: 'Seeded', count: stations.length };
  }
}
