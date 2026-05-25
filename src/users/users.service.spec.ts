import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

const mockUser: Partial<User> = {
  id: 'uuid-1',
  email: 'a@b.com',
  name: 'Test',
  role: 'staff',
};

const mockRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  it('findByEmail returns user when found', async () => {
    mockRepo.findOne.mockResolvedValue(mockUser);
    const result = await service.findByEmail('a@b.com');
    expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
    expect(result).toEqual(mockUser);
  });

  it('findByEmail returns null when not found', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    const result = await service.findByEmail('x@x.com');
    expect(result).toBeNull();
  });

  it('findById returns user by id', async () => {
    mockRepo.findOne.mockResolvedValue(mockUser);
    const result = await service.findById('uuid-1');
    expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
    expect(result).toEqual(mockUser);
  });

  it('create saves and returns new user', async () => {
    mockRepo.create.mockReturnValue(mockUser);
    mockRepo.save.mockResolvedValue(mockUser);
    const result = await service.create({ name: 'Test', email: 'a@b.com', password: 'hash', role: 'staff' });
    expect(mockRepo.create).toHaveBeenCalled();
    expect(mockRepo.save).toHaveBeenCalled();
    expect(result).toEqual(mockUser);
  });

  it('update saves changes and returns updated user', async () => {
    const updated = { ...mockUser, name: 'New' };
    mockRepo.findOne.mockResolvedValue(updated);
    mockRepo.save.mockResolvedValue(updated);
    const result = await service.update('uuid-1', { name: 'New' } as any);
    expect(result.name).toBe('New');
  });
});
