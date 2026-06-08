import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ActivityType, Prisma, User } from '@prisma/client';
import { Cache } from 'cache-manager';
import { CK, GEN, TTL } from '../cache/cache-keys';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getStats() {
    const cached = await this.cache.get<object>(CK.DASHBOARD_STATS);
    if (cached) return cached;

    const [totalPosts, published, drafts, scheduled, totalUsers] = await Promise.all([
      this.prisma.blogPost.count(),
      this.prisma.blogPost.count({ where: { status: 'published' } }),
      this.prisma.blogPost.count({ where: { status: 'draft' } }),
      this.prisma.blogPost.count({ where: { status: 'scheduled' } }),
      this.prisma.user.count(),
    ]);
    const result = { totalPosts, published, drafts, scheduled, totalUsers };
    await this.cache.set(CK.DASHBOARD_STATS, result, TTL.STATS);
    return result;
  }

  async getActivity() {
    const cached = await this.cache.get<object[]>(CK.DASHBOARD_ACTIVITY);
    if (cached) return cached;

    const events = await this.prisma.activityEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { omit: { password: true } } },
    });
    const result = events.map((e) => ({ ...e, time: this.relativeTime(e.createdAt) }));
    await this.cache.set(CK.DASHBOARD_ACTIVITY, result, TTL.ACTIVITY);
    return result;
  }

  async getChart(days: number) {
    const safeDays = Math.min(Math.max(1, days), 90);
    const key = CK.CHART(safeDays);
    const cached = await this.cache.get<object[]>(key);
    if (cached) return cached;

    const interval = `${safeDays} days`;
    const result = await this.prisma.$queryRaw<{ date: string; posts: number }[]>(
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
    await this.cache.set(key, result, TTL.CHART);
    return result;
  }

  async logActivity(type: ActivityType, message: string, user: User): Promise<void> {
    await this.prisma.activityEvent.create({
      data: { type, message, userId: user.id },
    });
    await this.cache.del(CK.DASHBOARD_ACTIVITY);
  }

  // Called by BlogService after any create / update / delete.
  // Bumps gen:blog so all list caches (blog list, public, user posts) become stale.
  async invalidatePostCaches(postId?: string): Promise<void> {
    const currentGen = (await this.cache.get<number>(GEN.BLOG)) ?? 0;
    await this.cache.set(GEN.BLOG, currentGen + 1, TTL.GEN);

    await Promise.all([
      this.cache.del(CK.DASHBOARD_STATS),
      this.cache.del(CK.DASHBOARD_ACTIVITY),
      ...CK.COMMON_CHART_DAYS.map((d) => this.cache.del(CK.CHART(d))),
      ...(postId ? [this.cache.del(CK.POST(postId))] : []),
    ]);
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
