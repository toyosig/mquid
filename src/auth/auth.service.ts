import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly dashboardService: DashboardService,
    private readonly prisma: PrismaService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Determine if the user has completed initial password setup.
    // Support both new passwordSet flag and legacy accounts (password non-null).
    const hasPassword = user.passwordSet || user.password !== null;

    if (!hasPassword) {
      // ── Setup key path: first-time login with the system-generated key ──
      if (!user.setupKey) throw new UnauthorizedException('Invalid credentials');

      const submittedHash = createHash('sha256').update(dto.password).digest('hex');
      if (submittedHash !== user.setupKey) throw new UnauthorizedException('Invalid credentials');

      if (!user.active) throw new UnauthorizedException('Account is deactivated');

      const setupPayload = { sub: user.id, email: user.email, role: user.role, purpose: 'password_setup' };
      const setup_token = this.jwtService.sign(setupPayload, { expiresIn: '15m' });

      return { setup_token, requires_password_setup: true };
    }

    // ── Normal password path ──
    if (!user.password) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    if (!user.active) throw new UnauthorizedException('Account is deactivated');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = this.jwtService.sign(payload);

    this.dashboardService.logActivity('login', `Admin logged in: ${user.name}`, user as any).catch(
      (err) => console.error('[AuthService] logActivity failed:', err),
    );

    const { password: _pw, setupKey: _sk, ...userSafe } = user;
    return { access_token, user: userSafe };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) return;

    const rawToken = randomUUID();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { token: tokenHash, userId: user.id, expiresAt },
    });

    // TODO: send email with rawToken
    console.log('[DEV] Password reset token:', rawToken);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ access_token: string; user: any }> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const tokenHash = createHash('sha256').update(dto.resetToken).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!record || record.used || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.user.id },
        data: { password: hashed, passwordSet: true },
      }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } }),
    ]);

    const user = await this.prisma.user.findUnique({
      where: { id: record.user.id },
      omit: { password: true, setupKey: true },
    });

    const payload = { sub: user!.id, email: user!.email, role: user!.role };
    const access_token = this.jwtService.sign(payload);
    return { access_token, user };
  }

  async setPassword(dto: SetPasswordDto): Promise<{ access_token: string; user: any }> {
    if (dto.password !== dto.confirmPassword) {
      throw new UnauthorizedException('Passwords do not match');
    }

    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const record = await this.prisma.inviteToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!record || record.used || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired invite token');
    }

    if (record.user.password) {
      throw new BadRequestException('Password has already been set for this account. Use forgot password to reset it.');
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.user.id },
        data: { password: hashed, passwordSet: true, setupKey: null },
      }),
      this.prisma.inviteToken.update({ where: { id: record.id }, data: { used: true } }),
    ]);

    const user = await this.prisma.user.findUnique({
      where: { id: record.user.id },
      omit: { password: true },
    });
    const payload = { sub: user!.id, email: user!.email, role: user!.role };
    const access_token = this.jwtService.sign(payload);
    return { access_token, user };
  }

  async setupPassword(dto: SetupPasswordDto): Promise<{ access_token: string; user: any }> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Verify and decode the short-lived setup token
    let payload: { sub: string; email: string; role: string; purpose: string };
    try {
      payload = this.jwtService.verify(dto.setupToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired setup token');
    }

    if (payload.purpose !== 'password_setup') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User not found');

    const alreadySet = user.passwordSet || user.password !== null;
    if (alreadySet) {
      throw new BadRequestException('Password has already been set for this account. Use forgot password to reset it.');
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashed, passwordSet: true, setupKey: null },
      }),
      this.prisma.inviteToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      }),
    ]);

    const updatedUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      omit: { password: true, setupKey: true },
    });

    const jwtPayload = { sub: updatedUser!.id, email: updatedUser!.email, role: updatedUser!.role };
    const access_token = this.jwtService.sign(jwtPayload);
    return { access_token, user: updatedUser };
  }
}
