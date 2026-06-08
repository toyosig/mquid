import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogPost, PostStatus, User } from '@prisma/client';
import { Cache } from 'cache-manager';
import { CK, TTL } from '../cache/cache-keys';
import { PaginationDto } from '../common/dto/pagination.dto';
import { DashboardService } from '../dashboard/dashboard.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

type BlogPostWithAuthor = BlogPost & { author: Omit<User, 'password'> };

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardService: DashboardService,
    private readonly notificationsService: NotificationsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async findAll(pagination: PaginationDto, status?: string, search?: string) {
    const { page, limit } = pagination;
    const validStatuses: string[] = ['draft', 'published', 'scheduled'];
    const where: any = {};
    if (status && validStatuses.includes(status)) {
      where.status = status as PostStatus;
    }
    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where,
        include: { author: { omit: { password: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return {
      data: data.map((p) => this.mapToResponse(p as BlogPostWithAuthor)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findPublic(page: number, limit: number) {
    const key = CK.PUBLIC(page, limit);
    const cached = await this.cache.get<object>(key);
    if (cached) return cached;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where: { status: 'published' },
        include: { author: { omit: { password: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.blogPost.count({ where: { status: 'published' } }),
    ]);

    const result = {
      data: data.map((p) => this.mapToResponse(p as BlogPostWithAuthor)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
    await this.cache.set(key, result, TTL.PUBLIC);
    return result;
  }

  async findOne(id: string) {
    const key = CK.POST(id);
    const cached = await this.cache.get<object>(key);
    if (cached) return cached;

    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: { author: { omit: { password: true } } },
    });
    if (!post) throw new NotFoundException('Blog post not found');
    const result = this.mapToResponse(post as BlogPostWithAuthor);
    await this.cache.set(key, result, TTL.POST);
    return result;
  }

  async create(dto: CreateBlogPostDto, author: User) {
    const saved = await this.prisma.blogPost.create({
      data: { ...dto, authorId: author.id },
      include: { author: { omit: { password: true } } },
    });

    const activityType = saved.status === 'published' ? 'publish' : 'draft';
    const activityMsg =
      saved.status === 'published'
        ? `Post published: ${saved.title}`
        : `Post saved as draft: ${saved.title}`;
    await this.dashboardService.logActivity(activityType, activityMsg, author as any);

    const isPublished = saved.status === 'published';
    const isScheduled = saved.status === 'scheduled';
    this.notificationsService.createForAllUsers({
      title: isPublished ? 'Post Published' : isScheduled ? 'Post Scheduled' : 'New Draft Created',
      message: isPublished
        ? `"${saved.title}" is now live.`
        : isScheduled
          ? `"${saved.title}" is scheduled for publication.`
          : `"${saved.title}" was saved as a draft.`,
      type: isPublished ? 'success' : 'info',
    }).catch((err) => console.error('[BlogService] notification failed:', err));

    this.dashboardService.invalidatePostCaches().catch(() => null);
    return this.mapToResponse(saved as BlogPostWithAuthor);
  }

  async update(id: string, dto: UpdateBlogPostDto, user: User) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');

    if (user.role === 'staff' && post.authorId !== user.id) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    if (dto.slug && dto.slug !== post.slug) {
      const conflict = await this.prisma.blogPost.findFirst({
        where: { slug: dto.slug, id: { not: id } },
      });
      if (conflict) throw new ConflictException('Slug already in use by another post');
    }

    const updated = await this.prisma.blogPost.update({
      where: { id },
      data: dto,
      include: { author: { omit: { password: true } } },
    });
    await this.dashboardService.logActivity('edit', `Post updated: ${updated.title}`, user as any);

    const justPublished = post.status !== 'published' && updated.status === 'published';
    this.notificationsService.createForAllUsers({
      title: justPublished ? 'Post Published' : 'Post Updated',
      message: justPublished
        ? `"${updated.title}" is now live.`
        : `"${updated.title}" was updated by ${(user as any).name ?? 'an admin'}.`,
      type: justPublished ? 'success' : 'info',
    }).catch((err) => console.error('[BlogService] notification failed:', err));

    this.dashboardService.invalidatePostCaches(id).catch(() => null);
    return this.mapToResponse(updated as BlogPostWithAuthor);
  }

  async remove(id: string, user: User) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');
    await this.prisma.blogPost.delete({ where: { id } });
    await this.dashboardService.logActivity('delete', `Post deleted: ${post.title}`, user as any);

    this.notificationsService.createForAllUsers({
      title: 'Post Deleted',
      message: `"${post.title}" was permanently deleted.`,
      type: 'warning',
    }).catch((err) => console.error('[BlogService] notification failed:', err));

    this.dashboardService.invalidatePostCaches(id).catch(() => null);
  }

  mapToResponse(post: BlogPostWithAuthor) {
    const { metaTitle, metaDescription, ogImage, author, ...rest } = post;
    return { ...rest, author, seo: { metaTitle, metaDescription, ogImage } };
  }
}
