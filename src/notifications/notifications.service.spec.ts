import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const mockUserId = 'user-uuid-1';
const mockNotif = {
  id: 'notif-1',
  title: 'Test',
  message: 'Test msg',
  type: 'info' as const,
  read: false,
  userId: mockUserId,
  createdAt: new Date(),
};

const mockPrisma = {
  notification: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(NotificationsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns paginated notifications for the correct user', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockNotif], 1]);
      const pagination: PaginationDto = { page: 1, limit: 10 };
      const result = await service.findAll(mockUserId, pagination) as any;
      expect(result.data).toEqual([mockNotif]);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('markOneAsRead', () => {
    it('marks notification read and returns it', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(mockNotif);
      mockPrisma.notification.update.mockResolvedValue({ ...mockNotif, read: true });
      const result = await service.markOneAsRead('notif-1', mockUserId);
      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: mockUserId },
      });
      expect(result.read).toBe(true);
    });

    it('throws NotFoundException when notification not found', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      await expect(service.markOneAsRead('bad-id', mockUserId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllAsRead', () => {
    it('returns { updated: N }', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });
      const result = await service.markAllAsRead(mockUserId);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, read: false },
        data: { read: true },
      });
      expect(result).toEqual({ updated: 3 });
    });
  });
});
