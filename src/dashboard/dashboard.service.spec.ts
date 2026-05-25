import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { ActivityEvent } from './entities/activity-event.entity';
import { BlogPost } from '../blog/entities/blog-post.entity';
import { User } from '../users/entities/user.entity';

describe('DashboardService - relativeTime', () => {
  let service: DashboardService;

  const activityRepo = { save: jest.fn(), create: jest.fn(), find: jest.fn() };
  const blogRepo = { count: jest.fn(), query: jest.fn() };
  const userRepo = { count: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(ActivityEvent), useValue: activityRepo },
        { provide: getRepositoryToken(BlogPost), useValue: blogRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();
    service = module.get(DashboardService);
  });

  it('returns "just now" for recent events', () => {
    const now = new Date();
    expect(service.relativeTime(now)).toBe('just now');
  });

  it('returns minutes ago', () => {
    const d = new Date(Date.now() - 5 * 60 * 1000);
    expect(service.relativeTime(d)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(service.relativeTime(d)).toBe('3h ago');
  });

  it('returns days ago', () => {
    const d = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(service.relativeTime(d)).toBe('2d ago');
  });
});
