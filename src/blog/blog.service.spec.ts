import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
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
  moderationStatus: 'pending',
  reviewedById: null,
  reviewedAt: null,
  rejectionReason: null,
  authorId: 'user-1',
  author: mockAuthor,
  reviewer: null,
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
const mockCache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
const dashboardService = {
  logActivity: jest.fn().mockResolvedValue(undefined),
  invalidatePostCaches: jest.fn().mockResolvedValue(undefined),
};
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
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();
    service = module.get(BlogService);
    jest.clearAllMocks();
    // restore cache miss by default
    mockCache.get.mockResolvedValue(null);
  });

  // ─── mapToResponse ────────────────────────────────────────────────────────────

  describe('mapToResponse', () => {
    it('maps flat SEO columns to nested seo object', () => {
      const result = service.mapToResponse(mockPost as any);
      expect(result.seo).toEqual({ metaTitle: 'SEO Title', metaDescription: 'SEO Desc', ogImage: null });
      expect(result).not.toHaveProperty('metaTitle');
      expect(result).not.toHaveProperty('metaDescription');
    });

    it('includes moderationStatus in response', () => {
      const result = service.mapToResponse(mockPost as any);
      expect(result).toHaveProperty('moderationStatus', 'pending');
    });
  });

  describe('mapToPublicResponse', () => {
    it('strips moderation fields from public response', () => {
      const result = service.mapToPublicResponse(mockPost as any);
      expect(result).not.toHaveProperty('moderationStatus');
      expect(result).not.toHaveProperty('rejectionReason');
      expect(result).not.toHaveProperty('reviewedAt');
      expect(result).not.toHaveProperty('reviewer');
    });

    it('still includes seo object', () => {
      const result = service.mapToPublicResponse(mockPost as any);
      expect(result.seo).toEqual({ metaTitle: 'SEO Title', metaDescription: 'SEO Desc', ogImage: null });
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('always forces moderationStatus to pending regardless of payload', async () => {
      const saved = { ...mockPost, status: 'published', moderationStatus: 'pending', author: mockAuthor };
      mockPrisma.blogPost.create.mockResolvedValue(saved);

      await service.create({ title: 'T', slug: 'slug', content: '{}', status: 'published', category: 'Insights', metaTitle: 'M', metaDescription: 'D' } as any, mockAdmin as any);

      expect(mockPrisma.blogPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ moderationStatus: 'pending' }),
        }),
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────────

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

  // ─── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('throws NotFoundException when post does not exist', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(null);
      await expect(service.remove('nonexistent', mockAdmin as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── adminFindOne ─────────────────────────────────────────────────────────────

  describe('adminFindOne', () => {
    it('throws NotFoundException for missing post', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(null);
      await expect(service.adminFindOne('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('returns post with moderation fields', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue({ ...mockPost, author: mockAuthor });
      const result = await service.adminFindOne('post-1');
      expect(result).toHaveProperty('moderationStatus');
    });
  });

  // ─── approvePost ─────────────────────────────────────────────────────────────

  describe('approvePost', () => {
    it('throws NotFoundException when post does not exist', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(null);
      await expect(service.approvePost('bad-id', mockAdmin as any)).rejects.toThrow(NotFoundException);
    });

    it('sets moderationStatus to approved with reviewer info', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(mockPost);
      const approved = { ...mockPost, moderationStatus: 'approved', reviewedById: 'admin-1', reviewedAt: new Date(), author: mockAuthor };
      mockPrisma.blogPost.update.mockResolvedValue(approved);

      await service.approvePost('post-1', mockAdmin as any);

      expect(mockPrisma.blogPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            moderationStatus: 'approved',
            reviewedById: 'admin-1',
          }),
        }),
      );
    });
  });

  // ─── rejectPost ──────────────────────────────────────────────────────────────

  describe('rejectPost', () => {
    it('throws NotFoundException when post does not exist', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(null);
      await expect(service.rejectPost('bad-id', mockAdmin as any, {})).rejects.toThrow(NotFoundException);
    });

    it('sets moderationStatus to rejected with optional reason', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(mockPost);
      const rejected = { ...mockPost, moderationStatus: 'rejected', rejectionReason: 'Too short', author: mockAuthor };
      mockPrisma.blogPost.update.mockResolvedValue(rejected);

      await service.rejectPost('post-1', mockAdmin as any, { reason: 'Too short' });

      expect(mockPrisma.blogPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            moderationStatus: 'rejected',
            rejectionReason: 'Too short',
          }),
        }),
      );
    });

    it('sets rejectionReason to null when no reason provided', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(mockPost);
      mockPrisma.blogPost.update.mockResolvedValue({ ...mockPost, moderationStatus: 'rejected', author: mockAuthor });

      await service.rejectPost('post-1', mockAdmin as any, {});

      expect(mockPrisma.blogPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rejectionReason: null }),
        }),
      );
    });
  });
});
