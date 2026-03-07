import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateKitchenStaffDto, UpdateKitchenStaffDto } from './dto/kitchen-staff.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class KitchenStaffService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      where: { role: 'kitchen' },
      select: {
        id: true,
        email: true,
        name: true,
        station: true,
        role: true,
        created_at: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateKitchenStaffDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const password_hash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        password_hash,
        name: dto.name,
        station: dto.station,
        role: 'kitchen',
      },
      select: {
        id: true,
        email: true,
        name: true,
        station: true,
        role: true,
        created_at: true,
      },
    });
  }

  async update(id: string, dto: UpdateKitchenStaffDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'kitchen') {
      throw new NotFoundException('Kitchen staff member not found');
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) {
      // Check uniqueness
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing && existing.id !== id) throw new ConflictException('Email already in use');
      data.email = dto.email;
    }
    if (dto.station !== undefined) data.station = dto.station;
    if (dto.password !== undefined) {
      data.password_hash = await bcrypt.hash(dto.password, 12);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        station: true,
        role: true,
        created_at: true,
      },
    });
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'kitchen') {
      throw new NotFoundException('Kitchen staff member not found');
    }
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Staff member deleted' };
  }
}
