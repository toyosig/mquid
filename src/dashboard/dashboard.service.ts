import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlogPost } from '../blog/entities/blog-post.entity';
import { User } from '../users/entities/user.entity';
import { ActivityEvent } from './entities/activity-event.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ActivityEvent)
    private readonly activityRepo: Repository<ActivityEvent>,
    @InjectRepository(BlogPost)
    private readonly blogPostRepo: Repository<BlogPost>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getStats() {
    const [totalPosts, publishedPosts, draftPosts, totalUsers] = await Promise.all([
      this.blogPostRepo.count(),
      this.blogPostRepo.count({ where: { status: 'published' } }),
      this.blogPostRepo.count({ where: { status: 'draft' } }),
      this.userRepo.count(),
    ]);
    return { totalPosts, publishedPosts, draftPosts, totalUsers };
  }

  async getActivity() {
    const events = await this.activityRepo.find({
      order: { createdAt: 'DESC' },
      take: 20,
    });
    return events.map((e) => ({ ...e, time: this.relativeTime(e.createdAt) }));
  }

  async getChart(days: number) {
    const result = await this.blogPostRepo.query(`
      SELECT
        to_char(d::date, 'YYYY-MM-DD') AS date,
        COALESCE(COUNT(p.id), 0)::int AS posts
      FROM generate_series(
        NOW() - INTERVAL '${days} days',
        NOW(),
        INTERVAL '1 day'
      ) AS d
      LEFT JOIN blog_posts p ON DATE(p.created_at) = d::date
      GROUP BY d
      ORDER BY d ASC
    `);
    return result;
  }

  async logActivity(
    type: 'publish' | 'draft' | 'login' | 'delete' | 'edit',
    message: string,
    user: User,
  ) {
    const event = this.activityRepo.create({ type, message, user });
    await this.activityRepo.save(event);
  }

  relativeTime(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
