import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Cache } from 'cache-manager';
import { CK, TTL } from '../cache/cache-keys';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

type SafeUser = Omit<User, 'password'>;

@Injectable()
export class ProfileService {
  constructor(
    private readonly usersService: UsersService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getProfile(userId: string): Promise<SafeUser> {
    const key = CK.PROFILE(userId);
    const cached = await this.cache.get<SafeUser>(key);
    if (cached) return cached;

    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    await this.cache.set(key, user, TTL.PROFILE);
    return user as SafeUser;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<SafeUser> {
    const updated = await this.usersService.update(userId, dto);
    if (!updated) throw new NotFoundException('User not found');

    // Invalidate profile and user management caches for this user
    await this.usersService.invalidateUserCaches(userId);
    await this.cache.set(CK.PROFILE(userId), updated, TTL.PROFILE);
    return updated as SafeUser;
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.password) throw new UnauthorizedException('Account has no password set');

    const passwordMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Current password is incorrect');

    const hashedNew = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.update(userId, { password: hashedNew });
    await this.cache.del(CK.PROFILE(userId));
  }
}
