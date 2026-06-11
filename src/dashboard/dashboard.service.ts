import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ActivityType, Prisma, User } from '@prisma/client';
import { Cache } from 'cache-manager';
import { CK, GEN, TTL } from '../cache/cache-keys';
import { PrismaService } from '../prisma/prisma.service';

type RequestUser = { id: string; role: string };

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getStats(requestUser: RequestUser) {
    // ── Staff: count only their own posts ────────────────────────────────────
    if (requestUser.role === 'staff') {
      const key = CK.DASHBOARD_STATS_USER(requestUser.id);
      const cached = await this.cache.get<object>(key);
      if (cached) return cached;

      const where = { authorId: requestUser.id };
      const [totalPosts, published, drafts, scheduled] = await Promise.all([
        this.prisma.blogPost.count({ where }),
        this.prisma.blogPost.count({ where: { ...where, status: 'published' } }),
        this.prisma.blogPost.count({ where: { ...where, status: 'draft' } }),
        this.prisma.blogPost.count({ where: { ...where, status: 'scheduled' } }),
      ]);
      const result = { totalPosts, published, drafts, scheduled };
      await this.cache.set(key, result, TTL.STATS);
      return result;
    }

    // ── Super admin: global counts ────────────────────────────────────────────
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

  async getActivity(requestUser: RequestUser) {
    // ── Staff: only their own activity events ────────────────────────────────
    if (requestUser.role === 'staff') {
      const key = CK.DASHBOARD_ACTIVITY_USER(requestUser.id);
      const cached = await this.cache.get<object[]>(key);
      if (cached) return cached;

      const events = await this.prisma.activityEvent.findMany({
        where: { userId: requestUser.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { user: { omit: { password: true } } },
      });
      const result = events.map((e) => ({ ...e, time: this.relativeTime(e.createdAt) }));
      await this.cache.set(key, result, TTL.ACTIVITY);
      return result;
    }

    // ── Super admin: all events ───────────────────────────────────────────────
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

  async getChart(days: number, requestUser: RequestUser) {
    const safeDays = Math.min(Math.max(1, days), 90);
    const interval = `${safeDays} days`;

    // ── Staff: chart for their posts only ────────────────────────────────────
    if (requestUser.role === 'staff') {
      const key = CK.CHART_USER(requestUser.id, safeDays);
      const cached = await this.cache.get<object[]>(key);
      if (cached) return cached;

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
          LEFT JOIN blog_posts p
            ON DATE(p.created_at) = d::date
            AND p.author_id = ${requestUser.id}
          GROUP BY d
          ORDER BY d ASC
        `,
      );
      await this.cache.set(key, result, TTL.CHART);
      return result;
    }

    // ── Super admin: all posts chart ─────────────────────────────────────────
    const key = CK.CHART(safeDays);
    const cached = await this.cache.get<object[]>(key);
    if (cached) return cached;

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
    // Invalidate both global and this user's personal activity cache
    await Promise.all([
      this.cache.del(CK.DASHBOARD_ACTIVITY),
      this.cache.del(CK.DASHBOARD_ACTIVITY_USER(user.id)),
    ]);
  }

  // Called by BlogService after any create / update / delete.
  // authorId — when provided, also clears that staff user's personal dashboard caches.
  async invalidatePostCaches(postId?: string, authorId?: string): Promise<void> {
    const currentGen = (await this.cache.get<number>(GEN.BLOG)) ?? 0;
    await this.cache.set(GEN.BLOG, currentGen + 1, TTL.GEN);

    const globalDeletes = [
      this.cache.del(CK.DASHBOARD_STATS),
      this.cache.del(CK.DASHBOARD_ACTIVITY),
      ...CK.COMMON_CHART_DAYS.map((d) => this.cache.del(CK.CHART(d))),
      ...(postId ? [this.cache.del(CK.POST(postId))] : []),
    ];

    const userDeletes = authorId
      ? [
          this.cache.del(CK.DASHBOARD_STATS_USER(authorId)),
          this.cache.del(CK.DASHBOARD_ACTIVITY_USER(authorId)),
          ...CK.COMMON_CHART_DAYS.map((d) => this.cache.del(CK.CHART_USER(authorId, d))),
        ]
      : [];

    await Promise.all([...globalDeletes, ...userDeletes]);
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
