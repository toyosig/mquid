import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

const mockUser = {
  id: 'uuid-1',
  email: 'admin@mymquid.com',
  password: '$2b$10$hashedpassword',
  name: 'Patrick Evra',
  role: 'super_admin' as const,
  avatar: null,
  active: true,
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService - login', () => {
  let service: AuthService;
  const usersService = { findByEmailWithPassword: jest.fn(), findByEmail: jest.fn(), update: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('jwt-token') };
  const dashboardService = { logActivity: jest.fn() };
  const mockPrisma = {
    user: { update: jest.fn() },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: DashboardService, useValue: dashboardService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('throws UnauthorizedException when user not found', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(null);
    await expect(service.login({ email: 'x@x.com', password: 'pass' })).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when password does not match', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(service.login({ email: mockUser.email, password: 'wrong' })).rejects.toThrow(UnauthorizedException);
  });

  it('returns access_token and user without password on successful login', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    dashboardService.logActivity.mockResolvedValue(undefined);
    const result = await service.login({ email: mockUser.email, password: 'Admin1234!' });
    expect(result.access_token).toBe('jwt-token');
    expect(result.user.email).toBe(mockUser.email);
    expect(result.user).not.toHaveProperty('password');
  });
});

describe('AuthService - forgotPassword', () => {
  let service: AuthService;
  const usersService = { findByEmailWithPassword: jest.fn(), findByEmail: jest.fn(), update: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('jwt-token') };
  const dashboardService = { logActivity: jest.fn() };
  const mockPrisma = {
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: { update: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: DashboardService, useValue: dashboardService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('returns void and does NOT create token when user not found', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    await expect(service.forgotPassword({ email: 'unknown@x.com' })).resolves.toBeUndefined();
    expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('creates a hashed token when user exists', async () => {
    usersService.findByEmail.mockResolvedValue({ id: 'uuid-1', email: 'admin@mymquid.com' });
    mockPrisma.passwordResetToken.create.mockResolvedValue({});
    await service.forgotPassword({ email: 'admin@mymquid.com' });
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'uuid-1',
        token: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
  });
});

describe('AuthService - resetPassword', () => {
  let service: AuthService;
  const usersService = { findByEmailWithPassword: jest.fn(), findByEmail: jest.fn(), update: jest.fn() };
  const jwtService = { sign: jest.fn() };
  const dashboardService = { logActivity: jest.fn() };
  const mockPrisma = {
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: { update: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: DashboardService, useValue: dashboardService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('throws UnauthorizedException when token not found', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);
    await expect(service.resetPassword({ token: 'bad-token', newPassword: 'NewPass1!' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when token already used', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'token-1',
      used: true,
      expiresAt: new Date(Date.now() + 3600000),
      user: { id: 'uuid-1' },
    });
    await expect(service.resetPassword({ token: 'used-token', newPassword: 'NewPass1!' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when token expired', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'token-1',
      used: false,
      expiresAt: new Date(Date.now() - 1000),
      user: { id: 'uuid-1' },
    });
    await expect(service.resetPassword({ token: 'expired-token', newPassword: 'NewPass1!' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('updates password and marks token used on valid token', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'token-1',
      used: false,
      expiresAt: new Date(Date.now() + 3600000),
      user: { id: 'uuid-1' },
    });
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhash');
    mockPrisma.$transaction.mockResolvedValue([{}, {}]);
    await service.resetPassword({ token: 'valid-token', newPassword: 'NewPass1!' });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
