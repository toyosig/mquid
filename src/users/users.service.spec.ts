import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const mockUser = {
  id: 'uuid-1',
  email: 'a@b.com',
  name: 'Test',
  role: 'staff' as const,
  avatar: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUserWithPassword = { ...mockUser, password: '$2b$10$hashedpassword' };

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  it('findByEmail returns user without password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    const result = await service.findByEmail('a@b.com');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'a@b.com' },
      omit: { password: true },
    });
    expect(result).toEqual(mockUser);
  });

  it('findByEmail returns null when not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const result = await service.findByEmail('x@x.com');
    expect(result).toBeNull();
  });

  it('findById returns user without password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    const result = await service.findById('uuid-1');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'uuid-1' },
      omit: { password: true },
    });
    expect(result).toEqual(mockUser);
  });

  it('create returns new user without password', async () => {
    mockPrisma.user.create.mockResolvedValue(mockUser);
    const result = await service.create({
      name: 'Test',
      email: 'a@b.com',
      password: 'hash',
      role: 'staff',
      avatar: null,
    });
    expect(result).toEqual(mockUser);
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: { name: 'Test', email: 'a@b.com', password: 'hash', role: 'staff', avatar: null },
      omit: { password: true },
    });
  });

  it('findByEmailWithPassword returns user WITH password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUserWithPassword);
    const result = await service.findByEmailWithPassword('a@b.com');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'a@b.com' },
    });
    expect(result).toHaveProperty('password');
  });

  it('findByIdWithPassword returns user WITH password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUserWithPassword);
    const result = await service.findByIdWithPassword('uuid-1');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'uuid-1' },
    });
    expect(result).toHaveProperty('password');
  });

  it('update returns updated user without password', async () => {
    const updated = { ...mockUser, name: 'New' };
    mockPrisma.user.update.mockResolvedValue(updated);
    const result = await service.update('uuid-1', { name: 'New' });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'uuid-1' },
      data: { name: 'New' },
      omit: { password: true },
    });
    expect(result?.name).toBe('New');
  });
});
