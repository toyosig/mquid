import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

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
  setupKey: null,
  passwordSet: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// User that has NOT completed password setup yet
const mockNewUser = {
  ...mockUser,
  id: 'uuid-new',
  password: null,
  passwordSet: false,
  setupKey: createHash('sha256').update('raw-setup-key-123').digest('hex'),
};

// ─── login ────────────────────────────────────────────────────────────────────

describe('AuthService - login', () => {
  let service: AuthService;
  const usersService = { findByEmailWithPassword: jest.fn(), findByEmail: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('jwt-token') };
  const dashboardService = { logActivity: jest.fn() };
  const mockPrisma = {
    user: { update: jest.fn() },
    passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
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
    jwtService.sign.mockReturnValue('jwt-token');
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
    expect((result as any).user.email).toBe(mockUser.email);
    expect((result as any).user).not.toHaveProperty('password');
  });

  it('returns setup_token with requires_password_setup when user uses setup key', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(mockNewUser);
    const result = await service.login({ email: mockNewUser.email, password: 'raw-setup-key-123' });
    expect(result).toHaveProperty('requires_password_setup', true);
    expect(result).toHaveProperty('setup_token');
    // sign called with purpose: 'password_setup'
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'password_setup' }),
      expect.objectContaining({ expiresIn: '15m' }),
    );
  });

  it('rejects setup key login when key does not match', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(mockNewUser);
    await expect(service.login({ email: mockNewUser.email, password: 'wrong-key' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects login when user has no password and no setupKey', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue({ ...mockNewUser, setupKey: null });
    await expect(service.login({ email: mockNewUser.email, password: 'any' })).rejects.toThrow(UnauthorizedException);
  });
});

// ─── forgotPassword ──────────────────────────────────────────────────────────

describe('AuthService - forgotPassword', () => {
  let service: AuthService;
  const usersService = { findByEmailWithPassword: jest.fn(), findByEmail: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('jwt-token') };
  const dashboardService = { logActivity: jest.fn() };
  const mockPrisma = {
    passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
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

// ─── resetPassword ────────────────────────────────────────────────────────────

describe('AuthService - resetPassword', () => {
  let service: AuthService;
  const usersService = { findByEmailWithPassword: jest.fn(), findByEmail: jest.fn() };
  const jwtService = { sign: jest.fn() };
  const dashboardService = { logActivity: jest.fn() };
  const mockPrisma = {
    passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
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

// ─── setupPassword ────────────────────────────────────────────────────────────

describe('AuthService - setupPassword', () => {
  let service: AuthService;
  const usersService = { findByEmailWithPassword: jest.fn(), findByEmail: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('full-jwt-token'), verify: jest.fn() };
  const dashboardService = { logActivity: jest.fn() };
  const mockPrisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    inviteToken: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const validSetupPayload = { sub: 'uuid-new', email: 'new@test.com', role: 'staff', purpose: 'password_setup' };

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
    jwtService.sign.mockReturnValue('full-jwt-token');
  });

  it('throws BadRequestException when passwords do not match', async () => {
    await expect(
      service.setupPassword({ setupToken: 'tok', password: 'Abc1!2345', confirmPassword: 'Different1!' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws UnauthorizedException when setup token is invalid', async () => {
    jwtService.verify.mockImplementation(() => { throw new Error('invalid'); });
    await expect(
      service.setupPassword({ setupToken: 'bad', password: 'Abc1!2345', confirmPassword: 'Abc1!2345' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when token purpose is not password_setup', async () => {
    jwtService.verify.mockReturnValue({ sub: 'uuid-1', email: 'x', role: 'staff', purpose: 'auth' });
    await expect(
      service.setupPassword({ setupToken: 'tok', password: 'Abc1!2345', confirmPassword: 'Abc1!2345' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws BadRequestException when password is already set', async () => {
    jwtService.verify.mockReturnValue(validSetupPayload);
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...mockUser, passwordSet: true, password: '$hashed' });
    await expect(
      service.setupPassword({ setupToken: 'tok', password: 'Abc1!2345', confirmPassword: 'Abc1!2345' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('sets password and returns full auth token on valid setup token', async () => {
    jwtService.verify.mockReturnValue(validSetupPayload);
    // First findUnique: user with no password set
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ ...mockNewUser })
      // Second findUnique: user after update (omit password)
      .mockResolvedValueOnce({ id: 'uuid-new', email: 'new@test.com', role: 'staff', passwordSet: true });
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhash');
    mockPrisma.$transaction.mockResolvedValue([{}, {}]);

    const result = await service.setupPassword({
      setupToken: 'valid-setup-tok',
      password: 'Abc1!2345',
      confirmPassword: 'Abc1!2345',
    });

    expect(result.access_token).toBe('full-jwt-token');
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
