import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogPost, ModerationStatus, PostStatus, User } from '@prisma/client';
import { Cache } from 'cache-manager';
import { CK, GEN, TTL } from '../cache/cache-keys';
import { PaginationDto } from '../common/dto/pagination.dto';
import { DashboardService } from '../dashboard/dashboard.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { RejectPostDto } from './dto/reject-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

type SafeUser = Omit<User, 'password'>;
type BlogPostWithAuthor = BlogPost & { author: SafeUser; reviewer?: SafeUser | null };

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardService: DashboardService,
    private readonly notificationsService: NotificationsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // ─── Authenticated staff/admin list ──────────────────────────────────────────

  async findAll(pagination: PaginationDto, currentUser: User, status?: string, search?: string, category?: string) {
    const { page, limit } = pagination;
    const gen = (await this.cache.get<number>(GEN.BLOG)) ?? 0;

    // Staff see only their own posts; admins see everything
    const scopedUserId = currentUser.role === 'staff' ? currentUser.id : '';
    const key = CK.BLOG_LIST(gen, page, limit, status, search, scopedUserId, category);
    const cached = await this.cache.get<object>(key);
    if (cached) return cached;

    const validStatuses: string[] = ['draft', 'published', 'scheduled'];
    const where: any = {};
    if (currentUser.role === 'staff') where.authorId = currentUser.id;
    if (status && validStatuses.includes(status)) where.status = status as PostStatus;
    if (search) where.title = { contains: search, mode: 'insensitive' };
    if (category) where.category = category;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where,
        include: { author: { omit: { password: true, setupKey: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    const result = {
      data: data.map((p) => this.mapToResponse(p as BlogPostWithAuthor)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
    await this.cache.set(key, result, TTL.LIST);
    return result;
  }

  // ─── Public list — approved posts only ───────────────────────────────────────

  async findPublic(page: number, limit: number) {
    const gen = (await this.cache.get<number>(GEN.BLOG)) ?? 0;
    const key = CK.PUBLIC(gen, page, limit);
    const cached = await this.cache.get<object>(key);
    if (cached) return cached;

    const where = { status: 'published' as PostStatus, moderationStatus: 'approved' as ModerationStatus };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where,
        include: { author: { omit: { password: true, setupKey: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    const result = {
      data: data.map((p) => this.mapToPublicResponse(p as BlogPostWithAuthor)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
    await this.cache.set(key, result, TTL.LIST);
    return result;
  }

  // ─── Single post ──────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const key = CK.POST(id);
    const cached = await this.cache.get<object>(key);
    if (cached) return cached;

    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: {
        author: { omit: { password: true, setupKey: true } },
        reviewer: { omit: { password: true, setupKey: true } },
      },
    });
    if (!post) throw new NotFoundException('Blog post not found');
    const result = this.mapToResponse(post as BlogPostWithAuthor);
    await this.cache.set(key, result, TTL.POST);
    return result;
  }

  // ─── Create ───────────────────────────────────────────────────────────────────

  async create(dto: CreateBlogPostDto, author: User) {
    const saved = await this.prisma.blogPost.create({
      data: {
        ...dto,
        authorId: author.id,
        moderationStatus: 'pending',
      },
      include: { author: { omit: { password: true, setupKey: true } } },
    });

    const activityType = saved.status === 'published' ? 'publish' : 'draft';
    const activityMsg =
      saved.status === 'published'
        ? `Post published: ${saved.title}`
        : `Post saved as draft: ${saved.title}`;
    await this.dashboardService.logActivity(activityType, activityMsg, author as any);

    const isPublished = saved.status === 'published';
    const isScheduled = saved.status === 'scheduled';
    this.notificationsService
      .createForAllUsers({
        title: isPublished ? 'Post Published' : isScheduled ? 'Post Scheduled' : 'New Draft Created',
        message: isPublished
          ? `"${saved.title}" is now live.`
          : isScheduled
            ? `"${saved.title}" is scheduled for publication.`
            : `"${saved.title}" was saved as a draft.`,
        type: isPublished ? 'success' : 'info',
      })
      .catch((err) => console.error('[BlogService] notification failed:', err));

    this.dashboardService.invalidatePostCaches(undefined, author.id).catch(() => null);
    return this.mapToResponse(saved as BlogPostWithAuthor);
  }

  // ─── Update ───────────────────────────────────────────────────────────────────

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

    const wasApproved = post.moderationStatus === 'approved';
    const updateData = {
      ...dto,
      ...(wasApproved && { moderationStatus: 'pending' as ModerationStatus }),
    };

    const updated = await this.prisma.blogPost.update({
      where: { id },
      data: updateData,
      include: { author: { omit: { password: true, setupKey: true } } },
    });
    await this.dashboardService.logActivity('edit', `Post updated: ${updated.title}`, user as any);

    const justPublished = post.status !== 'published' && updated.status === 'published';
    this.notificationsService
      .createForAllUsers({
        title: justPublished ? 'Post Published' : 'Post Updated',
        message: justPublished
          ? `"${updated.title}" is now live.`
          : `"${updated.title}" was updated by ${(user as any).name ?? 'an admin'}.`,
        type: justPublished ? 'success' : 'info',
      })
      .catch((err) => console.error('[BlogService] notification failed:', err));

    if (wasApproved) {
      this.notificationsService
        .createForUser(updated.authorId, {
          type: 'post_pending_review',
          title: 'Your post is pending review',
          message: `"${updated.title}" has been updated and is now pending review before going live again.`,
          postId: id,
        })
        .catch((err) => console.error('[BlogService] notification failed:', err));
    }

    this.dashboardService.invalidatePostCaches(id, updated.authorId).catch(() => null);
    return this.mapToResponse(updated as BlogPostWithAuthor);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  async remove(id: string, user: User) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');
    await this.prisma.blogPost.delete({ where: { id } });
    await this.dashboardService.logActivity('delete', `Post deleted: ${post.title}`, user as any);

    this.notificationsService
      .createForAllUsers({
        title: 'Post Deleted',
        message: `"${post.title}" was permanently deleted.`,
        type: 'warning',
      })
      .catch((err) => console.error('[BlogService] notification failed:', err));

    this.dashboardService.invalidatePostCaches(id, post.authorId).catch(() => null);
  }

  // ─── Admin moderation endpoints ───────────────────────────────────────────────

  async adminFindAll(pagination: PaginationDto, moderationStatus?: string) {
    const { page, limit } = pagination;
    const gen = (await this.cache.get<number>(GEN.BLOG)) ?? 0;
    const key = CK.ADMIN_BLOG_LIST(gen, page, limit, moderationStatus);
    const cached = await this.cache.get<object>(key);
    if (cached) return cached;

    const validModerationStatuses = ['pending', 'approved', 'rejected'];
    const where: any = {};
    if (moderationStatus && validModerationStatuses.includes(moderationStatus)) {
      where.moderationStatus = moderationStatus as ModerationStatus;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where,
        include: {
          author: { omit: { password: true, setupKey: true } },
          reviewer: { omit: { password: true, setupKey: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    const result = {
      data: data.map((p) => this.mapToResponse(p as BlogPostWithAuthor)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
    await this.cache.set(key, result, TTL.LIST);
    return result;
  }

  async adminFindOne(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: {
        author: { omit: { password: true, setupKey: true } },
        reviewer: { omit: { password: true, setupKey: true } },
      },
    });
    if (!post) throw new NotFoundException('Blog post not found');
    return this.mapToResponse(post as BlogPostWithAuthor);
  }

  async approvePost(id: string, reviewer: User) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');

    const updated = await this.prisma.blogPost.update({
      where: { id },
      data: {
        moderationStatus: 'approved',
        reviewedById: reviewer.id,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
      include: {
        author: { omit: { password: true, setupKey: true } },
        reviewer: { omit: { password: true, setupKey: true } },
      },
    });

    this.dashboardService.invalidatePostCaches(id, updated.authorId).catch(() => null);
    return this.mapToResponse(updated as BlogPostWithAuthor);
  }

  async rejectPost(id: string, reviewer: User, dto: RejectPostDto) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');

    const updated = await this.prisma.blogPost.update({
      where: { id },
      data: {
        moderationStatus: 'rejected',
        reviewedById: reviewer.id,
        reviewedAt: new Date(),
        rejectionReason: dto.reason ?? null,
      },
      include: {
        author: { omit: { password: true, setupKey: true } },
        reviewer: { omit: { password: true, setupKey: true } },
      },
    });

    const revocationMessage = dto.reason
      ? `"${updated.title}" has been revoked by an admin. Reason: ${dto.reason}. Please make the necessary corrections and resubmit.`
      : `"${updated.title}" has been revoked by an admin. Please make the necessary corrections and resubmit.`;

    this.notificationsService
      .createForUser(updated.authorId, {
        type: 'post_revoked',
        title: 'Your post was taken offline',
        message: revocationMessage,
        postId: id,
      })
      .catch((err) => console.error('[BlogService] notification failed:', err));

    this.dashboardService.invalidatePostCaches(id, updated.authorId).catch(() => null);
    return this.mapToResponse(updated as BlogPostWithAuthor);
  }

  // ─── Response mappers ─────────────────────────────────────────────────────────

  mapToResponse(post: BlogPostWithAuthor) {
    const { metaTitle, metaDescription, ogImage, author, reviewer, ...rest } = post;
    return { ...rest, author, reviewer: reviewer ?? null, seo: { metaTitle, metaDescription, ogImage } };
  }

  mapToPublicResponse(post: BlogPostWithAuthor) {
    const {
      metaTitle, metaDescription, ogImage,
      moderationStatus, reviewedById, reviewedAt, rejectionReason, reviewer,
      ...rest
    } = post as any;
    return { ...rest, seo: { metaTitle, metaDescription, ogImage } };
  }
}
