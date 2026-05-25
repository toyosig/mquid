import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { DashboardService } from '../dashboard/dashboard.service';
import { UsersService } from '../users/users.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetToken } from './entities/password-reset-token.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly dashboardService: DashboardService,
    @InjectRepository(PasswordResetToken)
    private readonly tokenRepo: Repository<PasswordResetToken>,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = this.jwtService.sign(payload);

    await this.dashboardService.logActivity(
      'login',
      `Admin logged in: ${user.name}`,
      user,
    );

    // Strip password before returning
    const { password: _pw, ...userSafe } = user as any;
    return { access_token, user: userSafe };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) return; // silently ignore — don't leak whether email exists

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const resetToken = this.tokenRepo.create({ token, user, expiresAt });
    await this.tokenRepo.save(resetToken);

    // TODO: send email
    console.log('[DEV] Password reset token:', token);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const record = await this.tokenRepo.findOne({
      where: { token: dto.token },
      relations: { user: true },
    });

    if (!record) throw new NotFoundException('Invalid reset token');
    if (record.used) throw new UnauthorizedException('Token already used');
    if (record.expiresAt < new Date())
      throw new UnauthorizedException('Token expired');

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.update(record.user.id, { password: hashed });

    record.used = true;
    await this.tokenRepo.save(record);
  }
}
