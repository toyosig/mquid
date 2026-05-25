import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { DashboardService } from '../dashboard/dashboard.service';
import { User } from '../users/entities/user.entity';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';
import { BlogPost } from './entities/blog-post.entity';

@Injectable()
export class BlogService {
  constructor(
    @InjectRepository(BlogPost)
    private readonly blogPostRepo: Repository<BlogPost>,
    private readonly dashboardService: DashboardService,
  ) {}

  async findAll(page: number, limit: number) {
    const [data, total] = await this.blogPostRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: data.map((p) => this.mapToResponse(p)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findPublic(page: number, limit: number) {
    const [data, total] = await this.blogPostRepo.findAndCount({
      where: { status: 'published' },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: data.map((p) => this.mapToResponse(p)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const post = await this.blogPostRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');
    return this.mapToResponse(post);
  }

  async create(dto: CreateBlogPostDto, author: User) {
    const post = this.blogPostRepo.create({ ...dto, author });
    const saved = await this.blogPostRepo.save(post);

    // Scheduled posts are logged as 'draft' (not yet published)
    const activityType = saved.status === 'published' ? 'publish' : 'draft';
    const activityMsg =
      saved.status === 'published'
        ? `Post published: ${saved.title}`
        : `Post saved as draft: ${saved.title}`;
    await this.dashboardService.logActivity(activityType, activityMsg, author);

    return this.mapToResponse(saved);
  }

  async update(id: string, dto: UpdateBlogPostDto, user: User) {
    const post = await this.blogPostRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');

    if (user.role === 'staff' && post.author.id !== user.id) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    if (dto.slug && dto.slug !== post.slug) {
      const conflict = await this.blogPostRepo.findOne({
        where: { slug: dto.slug, id: Not(id) },
      });
      if (conflict) throw new ForbiddenException('Slug already in use by another post');
    }

    const updated = await this.blogPostRepo.save({ ...post, ...dto });
    await this.dashboardService.logActivity('edit', `Post updated: ${updated.title}`, user);

    return this.mapToResponse(updated);
  }

  async remove(id: string, user: User) {
    const post = await this.blogPostRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');
    await this.blogPostRepo.remove(post);
    await this.dashboardService.logActivity('delete', `Post deleted: ${post.title}`, user);
  }

  mapToResponse(post: BlogPost) {
    const { metaTitle, metaDescription, ogImage, ...rest } = post as any;
    const { password: _pw, ...authorSafe } = rest.author ?? {};
    return { ...rest, author: authorSafe, seo: { metaTitle, metaDescription, ogImage } };
  }
}
