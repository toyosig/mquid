import { Injectable, NotFoundException } from '@nestjs/common';
import { Notification } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, pagination: PaginationDto) {
    const { page, limit } = pagination;
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

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async markOneAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with id "${id}" not found or does not belong to you`);
    }

    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
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
  }
}
