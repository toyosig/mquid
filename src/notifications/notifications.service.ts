import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Notification } from '@prisma/client';
import { Cache } from 'cache-manager';
import { CK, GEN, TTL } from '../cache/cache-keys';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async findAll(userId: string, pagination: PaginationDto) {
    const { page, limit } = pagination;
    const userGen = (await this.cache.get<number>(GEN.NOTIF_USER(userId))) ?? 0;
    const globalGen = (await this.cache.get<number>(GEN.NOTIF_GLOBAL)) ?? 0;
    const key = CK.NOTIFICATIONS(userId, userGen, globalGen, page, limit);

    const cached = await this.cache.get<object>(key);
    if (cached) return cached;

    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await this.cache.set(key, result, TTL.NOTIFICATIONS);
    return result;
  }

  async markOneAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) {
      throw new NotFoundException(`Notification with id "${id}" not found or does not belong to you`);
    }

    const updated = await this.prisma.notification.update({ where: { id }, data: { read: true } });
    await this.invalidateUserNotifications(userId);
    return updated;
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    await this.invalidateUserNotifications(userId);
    return { updated: result.count };
  }

  async createForAllUsers(payload: {
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
  }): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { active: true },
      select: { id: true },
    });

    if (users.length === 0) return;

    await this.prisma.notification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        title: payload.title,
        message: payload.message,
        type: payload.type as any,
        read: false,
      })),
    });

    // Bump global gen to invalidate all users' notification caches at once
    const globalGen = (await this.cache.get<number>(GEN.NOTIF_GLOBAL)) ?? 0;
    await this.cache.set(GEN.NOTIF_GLOBAL, globalGen + 1, TTL.GEN);
  }

  private async invalidateUserNotifications(userId: string): Promise<void> {
    const currentGen = (await this.cache.get<number>(GEN.NOTIF_USER(userId))) ?? 0;
    await this.cache.set(GEN.NOTIF_USER(userId), currentGen + 1, TTL.GEN);
  }
}
