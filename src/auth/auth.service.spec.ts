import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { UsersService } from '../users/users.service';
import { DashboardService } from '../dashboard/dashboard.service';

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
  role: 'super_admin',
};

describe('AuthService - login', () => {
  let service: AuthService;
  const usersService = { findByEmailWithPassword: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('jwt-token') };
  const dashboardService = { logActivity: jest.fn() };
  const tokenRepo = { create: jest.fn(), save: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: DashboardService, useValue: dashboardService },
        { provide: getRepositoryToken(PasswordResetToken), useValue: tokenRepo },
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

  it('returns access_token and user on successful login', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const result = await service.login({ email: mockUser.email, password: 'Admin1234!' });
    expect(result.access_token).toBe('jwt-token');
    expect(result.user.email).toBe(mockUser.email);
    expect(result.user.password).toBeUndefined(); // password must not be returned
    expect(dashboardService.logActivity).toHaveBeenCalledWith('login', expect.stringContaining('Patrick Evra'), mockUser);
  });
});
