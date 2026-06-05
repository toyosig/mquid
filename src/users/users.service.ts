import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Used by AuthModule ─────────────────────────────────────────

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email }, omit: { password: true } });
  }

  findByEmailWithPassword(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id }, omit: { password: true } });
  }

  findByIdWithPassword(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) {
    return this.prisma.user.create({ data, omit: { password: true } });
  }

  update(id: string, data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>) {
    return this.prisma.user.update({ where: { id }, data, omit: { password: true } });
  }

  // ─── User management (super_admin only) ──────────────────────────

  private async computeStats(userIds: string[]) {
    const grouped = await this.prisma.blogPost.groupBy({
      by: ['authorId', 'status'],
      where: { authorId: { in: userIds } },
      _count: { id: true },
    });

    const map: Record<string, { published: number; drafts: number; scheduled: number; total: number }> = {};
    for (const userId of userIds) {
      map[userId] = { published: 0, drafts: 0, scheduled: 0, total: 0 };
    }
    for (const row of grouped) {
      const entry = map[row.authorId];
      if (!entry) continue;
      if (row.status === 'published') entry.published = row._count.id;
      else if (row.status === 'draft') entry.drafts = row._count.id;
      else if (row.status === 'scheduled') entry.scheduled = row._count.id;
      entry.total += row._count.id;
    }
    return map;
  }

  private attachStats<T extends { id: string }>(
    user: T,
    statsMap: Record<string, { published: number; drafts: number; scheduled: number; total: number }>,
  ) {
    return {
      ...user,
      stats: statsMap[user.id] ?? { published: 0, drafts: 0, scheduled: 0, total: 0 },
    };
  }

  async findAllWithStats(pagination: PaginationDto) {
    const { page, limit } = pagination;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        omit: { password: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);

    const statsMap = await this.computeStats(users.map((u) => u.id));
    return {
      data: users.map((u) => this.attachStats(u, statsMap)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOneWithStats(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, omit: { password: true } });
    if (!user) throw new NotFoundException('User not found');
    const statsMap = await this.computeStats([id]);
    return this.attachStats(user, statsMap);
  }

  async createWithInvite(dto: CreateUserDto, frontendOrigin: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, role: dto.role as UserRole, active: true },
      omit: { password: true },
    });

    const rawToken = randomUUID();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await this.prisma.inviteToken.create({
      data: { token: tokenHash, userId: user.id, expiresAt },
    });

    console.log(`[DEV] Invite link: ${frontendOrigin}/admin/set-password?token=${rawToken}`);

    const statsMap = await this.computeStats([user.id]);
    return this.attachStats(user, statsMap);
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.email !== user.email) {
      const conflict = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (conflict) throw new ConflictException('Email taken by another user');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { name: dto.name, email: dto.email, role: dto.role as UserRole },
      omit: { password: true },
    });
    const statsMap = await this.computeStats([id]);
    return this.attachStats(updated, statsMap);
  }

  async updateStatus(id: string, active: boolean, requesterId: string) {
    if (id === requesterId) {
      throw new BadRequestException('Cannot deactivate your own account');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { active },
      omit: { password: true },
    });
    const statsMap = await this.computeStats([id]);
    return this.attachStats(updated, statsMap);
  }

  async deleteUser(id: string, requesterId: string) {
    if (id === requesterId) {
      throw new BadRequestException('Cannot delete your own account');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.$transaction([
      this.prisma.blogPost.deleteMany({ where: { authorId: id } }),
      this.prisma.user.delete({ where: { id } }),
    ]);
  }

  async triggerPasswordReset(id: string, frontendOrigin: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const rawToken = randomUUID();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { token: tokenHash, userId: id, expiresAt },
    });

    console.log(`[DEV] Password reset link: ${frontendOrigin}/admin/reset-password?token=${rawToken}`);
    return { message: 'Reset email sent' };
  }

  async findUserPosts(id: string, pagination: PaginationDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const { page, limit } = pagination;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where: { authorId: id },
        include: { author: { omit: { password: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.blogPost.count({ where: { authorId: id } }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
