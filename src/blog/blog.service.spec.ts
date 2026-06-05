import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BlogService } from './blog.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const mockAuthor = { id: 'user-1', role: 'staff', name: 'Staff User' };
const mockAdmin = { id: 'admin-1', role: 'super_admin', name: 'Admin' };
const mockPost = {
  id: 'post-1',
  title: 'Test Post',
  slug: 'test-post',
  status: 'draft',
  authorId: 'user-1',
  author: mockAuthor,
  metaTitle: 'SEO Title',
  metaDescription: 'SEO Desc',
  ogImage: null,
  content: '{}',
  category: 'Insights',
  tags: [],
  featuredImage: null,
  scheduledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  blogPost: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};
const dashboardService = { logActivity: jest.fn() };
const notificationsService = { createForAllUsers: jest.fn().mockResolvedValue(undefined) };

describe('BlogService', () => {
  let service: BlogService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BlogService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DashboardService, useValue: dashboardService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();
    service = module.get(BlogService);
    jest.clearAllMocks();
  });

  describe('mapToResponse', () => {
    it('maps flat SEO columns to nested seo object', () => {
      const result = service.mapToResponse(mockPost as any);
      expect(result.seo).toEqual({ metaTitle: 'SEO Title', metaDescription: 'SEO Desc', ogImage: null });
      expect(result).not.toHaveProperty('metaTitle');
      expect(result).not.toHaveProperty('metaDescription');
    });
  });

  describe('update', () => {
    it('throws NotFoundException when post does not exist', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(null);
      await expect(service.update('post-1', { title: 'New' }, mockAuthor as any)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when staff tries to edit another author post', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue({ ...mockPost, authorId: 'other-user' });
      await expect(
        service.update('post-1', { title: 'New' }, { id: 'user-1', role: 'staff' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows staff to edit their own post', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue({ ...mockPost, authorId: 'user-1' });
      mockPrisma.blogPost.update.mockResolvedValue({ ...mockPost, title: 'Updated', author: mockAuthor });
      await expect(service.update('post-1', { title: 'Updated' }, mockAuthor as any)).resolves.toBeDefined();
    });

    it('allows super_admin to edit any post', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue({ ...mockPost, authorId: 'other-user' });
      mockPrisma.blogPost.update.mockResolvedValue({ ...mockPost, title: 'Updated', author: mockAuthor });
      await expect(service.update('post-1', { title: 'Updated' }, mockAdmin as any)).resolves.toBeDefined();
    });

    it('throws ConflictException when slug is already taken by another post', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue({ ...mockPost, authorId: 'user-1' });
      mockPrisma.blogPost.findFirst.mockResolvedValue({ id: 'other-post', slug: 'taken-slug' });
      await expect(
        service.update('post-1', { slug: 'taken-slug' }, mockAdmin as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when post does not exist', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(null);
      await expect(service.remove('nonexistent', mockAdmin as any)).rejects.toThrow(NotFoundException);
    });
  });
});
