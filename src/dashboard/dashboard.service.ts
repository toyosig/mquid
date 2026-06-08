import { Injectable } from '@nestjs/common';
import { ActivityType, Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [totalPosts, published, drafts, scheduled, totalUsers] = await Promise.all([
      this.prisma.blogPost.count(),
      this.prisma.blogPost.count({ where: { status: 'published' } }),
      this.prisma.blogPost.count({ where: { status: 'draft' } }),
      this.prisma.blogPost.count({ where: { status: 'scheduled' } }),
      this.prisma.user.count(),
    ]);
    return { totalPosts, published, drafts, scheduled, totalUsers };
  }

  async getActivity() {
    const events = await this.prisma.activityEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { omit: { password: true } } },
    });
    return events.map((e) => ({ ...e, time: this.relativeTime(e.createdAt) }));
  }

  async getChart(days: number) {
    const safeDays = Math.min(Math.max(1, days), 90);
    const interval = `${safeDays} days`;
    return this.prisma.$queryRaw<{ date: string; posts: number }[]>(
      Prisma.sql`
        SELECT
          to_char(d::date, 'YYYY-MM-DD') AS date,
          COALESCE(COUNT(p.id), 0)::int AS posts
        FROM generate_series(
          NOW() - CAST(${interval} AS interval),
          NOW(),
          INTERVAL '1 day'
        ) AS d
        LEFT JOIN blog_posts p ON DATE(p.created_at) = d::date
        GROUP BY d
        ORDER BY d ASC
      `,
    );
  }

  async logActivity(type: ActivityType, message: string, user: User): Promise<void> {
    await this.prisma.activityEvent.create({
      data: { type, message, userId: user.id },
    });
  }

  relativeTime(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
}
