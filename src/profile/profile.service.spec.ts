import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

const mockUser = (): Partial<User> & { id: string } => ({
  id: 'user-uuid-1',
  name: 'Patrick Evra',
  email: 'admin@mymquid.com',
  password: 'hashed-password',
  role: 'super_admin',
  avatar: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const mockUsersService = {
  findById: jest.fn(),
  findByIdWithPassword: jest.fn(),
  update: jest.fn(),
};

describe('ProfileService', () => {
  let service: ProfileService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
  });

  // ── getProfile ─────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('returns the user when found', async () => {
      const user = mockUser();
      mockUsersService.findById.mockResolvedValue(user);

      const result = await service.getProfile(user.id);

      expect(result).toEqual(user);
      expect(mockUsersService.findById).toHaveBeenCalledWith(user.id);
    });

    it('throws NotFoundException when user not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(service.getProfile('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── updateProfile ───────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('updates and returns the user', async () => {
      const user = mockUser();
      const dto: UpdateProfileDto = { name: 'New Name', email: 'new@mymquid.com' };
      const updated = { ...user, ...dto };

      mockUsersService.update.mockResolvedValue(updated);

      const result = await service.updateProfile(user.id, dto);

      expect(result).toEqual(updated);
      expect(mockUsersService.update).toHaveBeenCalledWith(user.id, dto);
    });

    it('throws NotFoundException when update returns null', async () => {
      mockUsersService.update.mockResolvedValue(null);

      await expect(
        service.updateProfile('non-existent-id', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── changePassword ──────────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('succeeds with correct current password', async () => {
      const plainPassword = 'OldPassword1!';
      const hashed = await bcrypt.hash(plainPassword, 10);
      const user = Object.assign(mockUser(), { password: hashed });

      mockUsersService.findByIdWithPassword.mockResolvedValue(user);
      mockUsersService.update.mockResolvedValue(user);

      const dto: ChangePasswordDto = {
        currentPassword: plainPassword,
        newPassword: 'NewPassword2!',
      };

      await expect(service.changePassword(user.id, dto)).resolves.toBeUndefined();
      expect(mockUsersService.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ password: expect.any(String) }),
      );
    });

    it('throws UnauthorizedException on wrong current password', async () => {
      const hashed = await bcrypt.hash('CorrectPassword1!', 10);
      const user = Object.assign(mockUser(), { password: hashed });

      mockUsersService.findByIdWithPassword.mockResolvedValue(user);

      const dto: ChangePasswordDto = {
        currentPassword: 'WrongPassword!',
        newPassword: 'NewPassword2!',
      };

      await expect(service.changePassword(user.id, dto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUsersService.update).not.toHaveBeenCalled();
    });
  });
});
