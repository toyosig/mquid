import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BlogService } from './blog.service';
import { BlogPost } from './entities/blog-post.entity';
import { DashboardService } from '../dashboard/dashboard.service';

const mockAuthor = { id: 'user-1', role: 'staff', name: 'Staff User' };
const mockAdmin = { id: 'admin-1', role: 'super_admin', name: 'Admin' };
const mockPost = {
  id: 'post-1',
  title: 'Test Post',
  slug: 'test-post',
  status: 'draft',
  author: mockAuthor,
  metaTitle: 'SEO Title',
  metaDescription: 'SEO Desc',
  ogImage: null,
};

const blogRepo = {
  findAndCount: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
};
const dashboardService = { logActivity: jest.fn() };

describe('BlogService', () => {
  let service: BlogService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BlogService,
        { provide: getRepositoryToken(BlogPost), useValue: blogRepo },
        { provide: DashboardService, useValue: dashboardService },
      ],
    }).compile();
    service = module.get(BlogService);
    jest.clearAllMocks();
  });

  describe('mapToResponse', () => {
    it('maps flat SEO columns to nested seo object', () => {
      const result = service.mapToResponse(mockPost as any);
      expect(result.seo).toEqual({
        metaTitle: 'SEO Title',
        metaDescription: 'SEO Desc',
        ogImage: null,
      });
      expect(result).not.toHaveProperty('metaTitle');
      expect(result).not.toHaveProperty('metaDescription');
    });
  });

  describe('update', () => {
    it('throws ForbiddenException when staff tries to edit another author post', async () => {
      blogRepo.findOne.mockResolvedValue({ ...mockPost, author: { id: 'other-user' } });
      await expect(
        service.update('post-1', { title: 'New' }, { id: 'user-1', role: 'staff' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows staff to edit their own post', async () => {
      blogRepo.findOne.mockResolvedValue({ ...mockPost, author: { id: 'user-1' } });
      blogRepo.save.mockResolvedValue({ ...mockPost, title: 'Updated' });
      await expect(
        service.update('post-1', { title: 'Updated' }, mockAuthor as any),
      ).resolves.toBeDefined();
    });

    it('allows super_admin to edit any post', async () => {
      blogRepo.findOne.mockResolvedValue({ ...mockPost, author: { id: 'other-user' } });
      blogRepo.save.mockResolvedValue({ ...mockPost, title: 'Updated' });
      await expect(
        service.update('post-1', { title: 'Updated' }, mockAdmin as any),
      ).resolves.toBeDefined();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when post does not exist', async () => {
      blogRepo.findOne.mockResolvedValue(null);
      await expect(service.remove('nonexistent', mockAdmin as any)).rejects.toThrow(NotFoundException);
    });
  });
});
