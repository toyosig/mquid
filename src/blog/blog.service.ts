import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogPost, PostStatus, User } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

type BlogPostWithAuthor = BlogPost & { author: Omit<User, 'password'> };

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardService: DashboardService,
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

    return {
      data: data.map((p) => this.mapToResponse(p as BlogPostWithAuthor)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: { author: { omit: { password: true } } },
    });
    if (!post) throw new NotFoundException('Blog post not found');
    return this.mapToResponse(post as BlogPostWithAuthor);
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

    return this.mapToResponse(updated as BlogPostWithAuthor);
  }

  async remove(id: string, user: User) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');
    await this.prisma.blogPost.delete({ where: { id } });
    await this.dashboardService.logActivity('delete', `Post deleted: ${post.title}`, user as any);
  }

  mapToResponse(post: BlogPostWithAuthor) {
    const { metaTitle, metaDescription, ogImage, author, ...rest } = post;
    return { ...rest, author, seo: { metaTitle, metaDescription, ogImage } };
  }
}
