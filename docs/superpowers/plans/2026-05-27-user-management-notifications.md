# User Management, Notifications & Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the User Management API (9 endpoints), invite/set-password flow, blog event notifications, and Cloudinary file uploads as specified in the two API spec PDFs.

**Architecture:** This is a Prisma 5.x / NestJS 11 codebase with a global PrismaModule — no TypeORM, no @InjectRepository. Stats are aggregated with `prisma.blogPost.groupBy()`. Notifications are batch-inserted with `prisma.notification.createMany()`. Cloud upload uses Cloudinary (memoryStorage → buffer → cloud URL). The User schema gains `active` and `lastLogin` fields; a new `InviteToken` model is added.

**Tech Stack:** NestJS 11, Prisma 5.22.0, PostgreSQL (Neon), Cloudinary SDK, class-validator, passport-jwt

---

## File Map

**Create:**
- `src/users/users.controller.ts` — 9 user-management endpoints, all `@Roles('super_admin')`
- `src/users/dto/create-user.dto.ts` — name, email, role (no password)
- `src/users/dto/update-user.dto.ts` — name, email, role
- `src/users/dto/update-status.dto.ts` — active: boolean
- `src/auth/dto/set-password.dto.ts` — token, password, confirmPassword

**Modify:**
- `prisma/schema.prisma` — add `active`, `lastLogin` to User; add `InviteToken` model
- `src/users/users.service.ts` — add 7 new methods + extend existing
- `src/users/users.module.ts` — add UsersController
- `src/auth/auth.service.ts` — add `setPassword()`, check `active` in `login()`, update `lastLogin`
- `src/auth/auth.controller.ts` — add `POST /auth/set-password`
- `src/auth/strategies/jwt.strategy.ts` — check `active` in `validate()` via DB lookup
- `src/notifications/notifications.service.ts` — add `createForAllUsers()`
- `src/notifications/notifications.module.ts` — export NotificationsService
- `src/blog/blog.service.ts` — inject NotificationsService, call after create/update/remove
- `src/blog/blog.module.ts` — import NotificationsModule
- `src/upload/upload.controller.ts` — switch to memoryStorage, pass buffer to service
- `src/upload/upload.service.ts` — Cloudinary upload, return permanent public URL
- `.env.example` — add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

---

### Task 1: Prisma Schema — User fields + InviteToken model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update schema.prisma**

Replace the User model and add InviteToken. The full updated schema:

```prisma
// prisma/schema.prisma — replace entire file content

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["omitApi"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  super_admin
  staff
}

enum PostStatus {
  draft
  published
  scheduled
}

enum ActivityType {
  publish
  draft
  login
  delete
  edit
}

enum NotificationType {
  info
  success
  warning
  error
}

model User {
  id                  String               @id @default(uuid())
  name                String
  email               String               @unique
  password            String?
  role                UserRole             @default(staff)
  avatar              String?
  active              Boolean              @default(true)
  lastLogin           DateTime?
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  blogPosts           BlogPost[]
  activityEvents      ActivityEvent[]
  notifications       Notification[]
  passwordResetTokens PasswordResetToken[]
  inviteTokens        InviteToken[]

  @@map("admin_users")
}

model BlogPost {
  id              String     @id @default(uuid())
  title           String     @db.VarChar(200)
  slug            String     @unique
  content         String     @db.Text
  status          PostStatus
  category        String
  tags            String[]
  featuredImage   String?
  metaTitle       String     @db.VarChar(60)
  metaDescription String     @db.VarChar(160)
  ogImage         String?
  scheduledAt     DateTime?
  author          User       @relation(fields: [authorId], references: [id])
  authorId        String
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  @@index([authorId])
  @@index([status])
  @@index([createdAt])
  @@map("blog_posts")
}

model ActivityEvent {
  id        String       @id @default(uuid())
  type      ActivityType
  message   String
  user      User         @relation(fields: [userId], references: [id])
  userId    String
  createdAt DateTime     @default(now())

  @@index([createdAt])
  @@map("activity_events")
}

model Notification {
  id        String           @id @default(uuid())
  title     String
  message   String
  type      NotificationType
  read      Boolean          @default(false)
  user      User             @relation(fields: [userId], references: [id])
  userId    String
  createdAt DateTime         @default(now())

  @@index([userId, read])
  @@map("notifications")
}

model PasswordResetToken {
  id        String   @id @default(uuid())
  token     String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())

  @@map("password_reset_tokens")
}

model InviteToken {
  id        String   @id @default(uuid())
  token     String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())

  @@map("invite_tokens")
}
```

Key change: `password` is now `String?` (nullable) — new invited users have no password until they call `/auth/set-password`.

- [ ] **Step 2: Run migration**

```powershell
npx prisma migrate dev --name add_user_active_lastlogin_invite_token
```

Expected: Migration created and applied. `npx prisma generate` runs automatically.

- [ ] **Step 3: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: 0 errors. (The nullable `password` field may require fixes in `auth.service.ts` — fix any TS errors found before committing.)

- [ ] **Step 4: Fix auth.service.ts for nullable password**

In `src/auth/auth.service.ts`, the `login()` method calls `bcrypt.compare(dto.password, user.password)`. Since password is now `string | null`, add a null guard:

```typescript
async login(dto: LoginDto) {
  const user = await this.usersService.findByEmailWithPassword(dto.email);
  if (!user || !user.password) throw new UnauthorizedException('Invalid credentials');

  const passwordMatch = await bcrypt.compare(dto.password, user.password);
  if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

  if (!user.active) throw new UnauthorizedException('Account is deactivated');

  // Update lastLogin
  await this.prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

  const payload = { sub: user.id, email: user.email, role: user.role };
  const access_token = this.jwtService.sign(payload);

  this.dashboardService.logActivity('login', `Admin logged in: ${user.name}`, user as any).catch(
    (err) => console.error('[AuthService] logActivity failed:', err),
  );

  const { password: _pw, ...userSafe } = user;
  return { access_token, user: userSafe };
}
```

- [ ] **Step 5: Commit**

```powershell
git add prisma/ src/auth/auth.service.ts
git commit -m "feat: add active, lastLogin to User and InviteToken model"
```

---

### Task 2: UsersService — management methods

**Files:**
- Modify: `src/users/users.service.ts`
- Create: `src/users/dto/create-user.dto.ts`
- Create: `src/users/dto/update-user.dto.ts`
- Create: `src/users/dto/update-status.dto.ts`

The `UserWithStats` shape required by the frontend:
```typescript
{
  id, name, email, role, avatar, active, lastLogin, createdAt,
  stats: { published, drafts, scheduled, total }
}
```

- [ ] **Step 1: Create create-user.dto.ts**

```typescript
// src/users/dto/create-user.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'Jane Staff' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'jane@mymquid.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}
```

- [ ] **Step 2: Create update-user.dto.ts**

```typescript
// src/users/dto/update-user.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @ApiProperty({ example: 'Jane Updated' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'jane@mymquid.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}
```

- [ ] **Step 3: Create update-status.dto.ts**

```typescript
// src/users/dto/update-status.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  active: boolean;
}
```

- [ ] **Step 4: Replace users.service.ts**

```typescript
// src/users/users.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Used by AuthModule ────────────────────────────────────────────────────

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email }, omit: { password: true } });
  }

  findByEmailWithPassword(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id }, omit: { password: true } });
  }

  findByIdWithPassword(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) {
    return this.prisma.user.create({ data, omit: { password: true } });
  }

  update(id: string, data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>) {
    return this.prisma.user.update({ where: { id }, data, omit: { password: true } });
  }

  // ─── User management (super_admin only) ───────────────────────────────────

  private async computeStats(userIds: string[]) {
    const grouped = await this.prisma.blogPost.groupBy({
      by: ['authorId', 'status'],
      where: { authorId: { in: userIds } },
      _count: { id: true },
    });

    const map: Record<string, { published: number; drafts: number; scheduled: number; total: number }> = {};
    for (const userId of userIds) {
      map[userId] = { published: 0, drafts: 0, scheduled: 0, total: 0 };
    }
    for (const row of grouped) {
      const entry = map[row.authorId];
      if (!entry) continue;
      if (row.status === 'published') entry.published = row._count.id;
      else if (row.status === 'draft') entry.drafts = row._count.id;
      else if (row.status === 'scheduled') entry.scheduled = row._count.id;
      entry.total += row._count.id;
    }
    return map;
  }

  private attachStats<T extends { id: string }>(user: T, statsMap: Record<string, any>) {
    return { ...user, stats: statsMap[user.id] ?? { published: 0, drafts: 0, scheduled: 0, total: 0 } };
  }

  async findAllWithStats(pagination: PaginationDto) {
    const { page, limit } = pagination;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        omit: { password: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);

    const statsMap = await this.computeStats(users.map((u) => u.id));
    return {
      data: users.map((u) => this.attachStats(u, statsMap)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOneWithStats(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, omit: { password: true } });
    if (!user) throw new NotFoundException('User not found');
    const statsMap = await this.computeStats([id]);
    return this.attachStats(user, statsMap);
  }

  async createWithInvite(dto: CreateUserDto, frontendOrigin: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, role: dto.role as UserRole, active: true },
      omit: { password: true },
    });

    // Generate invite token
    const rawToken = randomUUID();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

    await this.prisma.inviteToken.create({
      data: { token: tokenHash, userId: user.id, expiresAt },
    });

    // TODO: send invite email
    console.log(`[DEV] Invite link: ${frontendOrigin}/admin/set-password?token=${rawToken}`);

    const statsMap = await this.computeStats([user.id]);
    return this.attachStats(user, statsMap);
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.email !== user.email) {
      const conflict = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (conflict) throw new ConflictException('Email taken by another user');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { name: dto.name, email: dto.email, role: dto.role as UserRole },
      omit: { password: true },
    });
    const statsMap = await this.computeStats([id]);
    return this.attachStats(updated, statsMap);
  }

  async updateStatus(id: string, active: boolean, requesterId: string) {
    if (id === requesterId) {
      throw new BadRequestException('Cannot deactivate your own account');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { active },
      omit: { password: true },
    });
    const statsMap = await this.computeStats([id]);
    return this.attachStats(updated, statsMap);
  }

  async deleteUser(id: string, requesterId: string) {
    if (id === requesterId) {
      throw new BadRequestException('Cannot delete your own account');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // Delete posts first to avoid FK constraint, then user
    await this.prisma.$transaction([
      this.prisma.blogPost.deleteMany({ where: { authorId: id } }),
      this.prisma.user.delete({ where: { id } }),
    ]);
  }

  async triggerPasswordReset(id: string, frontendOrigin: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const rawToken = randomUUID();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.prisma.passwordResetToken.create({
      data: { token: tokenHash, userId: id, expiresAt },
    });

    // TODO: send reset email
    console.log(`[DEV] Password reset link: ${frontendOrigin}/admin/reset-password?token=${rawToken}`);
    return { message: 'Reset email sent' };
  }

  async findUserPosts(id: string, pagination: PaginationDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const { page, limit } = pagination;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where: { authorId: id },
        include: { author: { omit: { password: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.blogPost.count({ where: { authorId: id } }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Run tests**

```powershell
npx jest src/users/users.service.spec.ts --no-coverage
```

Expected: existing tests pass (the new methods don't have tests — that's fine, we're not breaking existing ones).

- [ ] **Step 7: Commit**

```powershell
git add src/users/
git commit -m "feat: add user management methods to UsersService"
```

---

### Task 3: UsersController — 9 endpoints

**Files:**
- Create: `src/users/users.controller.ts`
- Modify: `src/users/users.module.ts`

- [ ] **Step 1: Create users.controller.ts**

```typescript
// src/users/users.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles('super_admin')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users with stats' })
  findAll(@Query() pagination: PaginationDto) {
    return this.usersService.findAllWithStats(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single user with stats' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOneWithStats(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create user and send invite email' })
  create(@Body() dto: CreateUserDto, @Req() req: any) {
    const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
    return this.usersService.createWithInvite(dto, origin);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user name, email, or role' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate or deactivate user account' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Req() req: any) {
    return this.usersService.updateStatus(id, dto.active, req.user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Permanently delete user' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.usersService.deleteUser(id, req.user.id);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Trigger password reset email for user' })
  resetPassword(@Param('id') id: string) {
    const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
    return this.usersService.triggerPasswordReset(id, origin);
  }

  @Get(':id/posts')
  @ApiOperation({ summary: 'Get all blog posts authored by this user' })
  getUserPosts(@Param('id') id: string, @Query() pagination: PaginationDto) {
    return this.usersService.findUserPosts(id, pagination);
  }
}
```

- [ ] **Step 2: Update users.module.ts**

```typescript
// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 3: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Run all tests**

```powershell
npx jest --no-coverage
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/users/
git commit -m "feat: add UsersController with full user management endpoints"
```

---

### Task 4: Auth — set-password endpoint + active check in JWT validate

**Files:**
- Create: `src/auth/dto/set-password.dto.ts`
- Modify: `src/auth/auth.service.ts`
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/strategies/jwt.strategy.ts`

- [ ] **Step 1: Create set-password.dto.ts**

```typescript
// src/auth/dto/set-password.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class SetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ description: 'Min 8 chars, must include number or symbol' })
  @IsString()
  @MinLength(8)
  @Matches(/[0-9!@#$%^&*(),.?":{}|<>]/, { message: 'password must contain a number or symbol' })
  password: string;

  @ApiProperty()
  @IsString()
  confirmPassword: string;
}
```

- [ ] **Step 2: Add setPassword() to auth.service.ts**

Add this method to `AuthService` in `src/auth/auth.service.ts` (after resetPassword):

```typescript
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

  const hashed = await bcrypt.hash(dto.password, 10);
  await this.prisma.$transaction([
    this.prisma.user.update({ where: { id: record.user.id }, data: { password: hashed } }),
    this.prisma.inviteToken.update({ where: { id: record.id }, data: { used: true } }),
  ]);

  const user = await this.prisma.user.findUnique({ where: { id: record.user.id }, omit: { password: true } });
  const payload = { sub: user!.id, email: user!.email, role: user!.role };
  const access_token = this.jwtService.sign(payload);
  return { access_token, user };
}
```

Also add to the import at the top:
```typescript
import { SetPasswordDto } from './dto/set-password.dto';
```

- [ ] **Step 3: Add POST /auth/set-password to auth.controller.ts**

Add this handler to `AuthController` in `src/auth/auth.controller.ts`:

```typescript
@Public()
@Post('set-password')
@HttpCode(200)
@ApiOperation({ summary: 'Set password from invite token (first-time setup)' })
setPassword(@Body() dto: SetPasswordDto) {
  return this.authService.setPassword(dto);
}
```

Also add to imports at the top:
```typescript
import { SetPasswordDto } from './dto/set-password.dto';
```

- [ ] **Step 4: Add active check in JwtStrategy.validate()**

Replace the validate method in `src/auth/strategies/jwt.strategy.ts` to check DB for active status:

```typescript
// src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('jwt.secret');
    if (!secret) throw new Error('JWT_SECRET environment variable is not set');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, active: true },
    });
    if (!user || !user.active) throw new UnauthorizedException('Account is deactivated or not found');
    return { id: user.id, email: user.email, role: user.role };
  }
}
```

Note: `PrismaService` is global (via `@Global() PrismaModule`) — NestJS will inject it automatically into JwtStrategy even without importing PrismaModule in AuthModule.

- [ ] **Step 5: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Run tests**

```powershell
npx jest --no-coverage
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/auth/
git commit -m "feat: add set-password endpoint and active user check in JWT strategy"
```

---

### Task 5: Notifications createForAllUsers + BlogService hooks

**Files:**
- Modify: `src/notifications/notifications.service.ts`
- Modify: `src/notifications/notifications.module.ts`
- Modify: `src/blog/blog.service.ts`
- Modify: `src/blog/blog.module.ts`

- [ ] **Step 1: Add createForAllUsers() to notifications.service.ts**

Add the method to `NotificationsService` in `src/notifications/notifications.service.ts` (add after `markAllAsRead`):

```typescript
async createForAllUsers(payload: {
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}): Promise<void> {
  const users = await this.prisma.user.findMany({
    where: { active: true },
    select: { id: true },
  });

  if (users.length === 0) return;

  await this.prisma.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      title: payload.title,
      message: payload.message,
      type: payload.type as any,
      read: false,
    })),
  });
}
```

Also add `NotificationType` to the Prisma import at the top if not already there. The import line should be:
```typescript
import { Notification, NotificationType } from '@prisma/client';
```

- [ ] **Step 2: Export NotificationsService from notifications.module.ts**

```typescript
// src/notifications/notifications.module.ts
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 3: Update blog.module.ts to import NotificationsModule**

```typescript
// src/blog/blog.module.ts
import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

@Module({
  imports: [DashboardModule, NotificationsModule],
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
```

- [ ] **Step 4: Inject NotificationsService into BlogService and add hooks**

Replace `src/blog/blog.service.ts` with the full updated version:

```typescript
// src/blog/blog.service.ts
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogPost, PostStatus, User } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';
import { DashboardService } from '../dashboard/dashboard.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

type BlogPostWithAuthor = BlogPost & { author: Omit<User, 'password'> };

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardService: DashboardService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(pagination: PaginationDto, status?: string, search?: string) {
    const { page, limit } = pagination;
    const validStatuses: string[] = ['draft', 'published', 'scheduled'];
    const where: any = {};
    if (status && validStatuses.includes(status)) {
      where.status = status as PostStatus;
    }
    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where,
        include: { author: { omit: { password: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return {
      data: data.map((p) => this.mapToResponse(p as BlogPostWithAuthor)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findPublic(page: number, limit: number) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where: { status: 'published' },
        include: { author: { omit: { password: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.blogPost.count({ where: { status: 'published' } }),
    ]);

    return {
      data: data.map((p) => this.mapToResponse(p as BlogPostWithAuthor)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      include: { author: { omit: { password: true } } },
    });
    if (!post) throw new NotFoundException('Blog post not found');
    return this.mapToResponse(post as BlogPostWithAuthor);
  }

  async create(dto: CreateBlogPostDto, author: User) {
    const saved = await this.prisma.blogPost.create({
      data: { ...dto, authorId: author.id },
      include: { author: { omit: { password: true } } },
    });

    const activityType = saved.status === 'published' ? 'publish' : 'draft';
    const activityMsg =
      saved.status === 'published'
        ? `Post published: ${saved.title}`
        : `Post saved as draft: ${saved.title}`;
    await this.dashboardService.logActivity(activityType, activityMsg, author as any);

    // Notify all active users
    const isPublished = saved.status === 'published';
    const isScheduled = saved.status === 'scheduled';
    this.notificationsService.createForAllUsers({
      title: isPublished ? 'Post Published' : isScheduled ? 'Post Scheduled' : 'New Draft Created',
      message: isPublished
        ? `"${saved.title}" is now live.`
        : isScheduled
          ? `"${saved.title}" is scheduled for publication.`
          : `"${saved.title}" was saved as a draft.`,
      type: isPublished ? 'success' : 'info',
    }).catch((err) => console.error('[BlogService] notification failed:', err));

    return this.mapToResponse(saved as BlogPostWithAuthor);
  }

  async update(id: string, dto: UpdateBlogPostDto, user: User) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');

    if (user.role === 'staff' && post.authorId !== user.id) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    if (dto.slug && dto.slug !== post.slug) {
      const conflict = await this.prisma.blogPost.findFirst({
        where: { slug: dto.slug, id: { not: id } },
      });
      if (conflict) throw new ConflictException('Slug already in use by another post');
    }

    const updated = await this.prisma.blogPost.update({
      where: { id },
      data: dto,
      include: { author: { omit: { password: true } } },
    });
    await this.dashboardService.logActivity('edit', `Post updated: ${updated.title}`, user as any);

    // Notify — detect if status changed to published
    const justPublished = post.status !== 'published' && updated.status === 'published';
    this.notificationsService.createForAllUsers({
      title: justPublished ? 'Post Published' : 'Post Updated',
      message: justPublished
        ? `"${updated.title}" is now live.`
        : `"${updated.title}" was updated by ${(user as any).name ?? 'an admin'}.`,
      type: justPublished ? 'success' : 'info',
    }).catch((err) => console.error('[BlogService] notification failed:', err));

    return this.mapToResponse(updated as BlogPostWithAuthor);
  }

  async remove(id: string, user: User) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');
    await this.prisma.blogPost.delete({ where: { id } });
    await this.dashboardService.logActivity('delete', `Post deleted: ${post.title}`, user as any);

    // Notify all active users
    this.notificationsService.createForAllUsers({
      title: 'Post Deleted',
      message: `"${post.title}" was permanently deleted.`,
      type: 'warning',
    }).catch((err) => console.error('[BlogService] notification failed:', err));
  }

  mapToResponse(post: BlogPostWithAuthor) {
    const { metaTitle, metaDescription, ogImage, author, ...rest } = post;
    return { ...rest, author, seo: { metaTitle, metaDescription, ogImage } };
  }
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Run tests**

```powershell
npx jest --no-coverage
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/notifications/ src/blog/
git commit -m "feat: add createForAllUsers notification hook in BlogService"
```

---

### Task 6: Upload — Cloudinary cloud storage

**Files:**
- Modify: `src/upload/upload.controller.ts`
- Modify: `src/upload/upload.service.ts`
- Modify: `.env.example`

The current upload uses local diskStorage — files are lost on Render redeploys. This task migrates to Cloudinary.

- [ ] **Step 1: Install Cloudinary SDK**

```powershell
npm install cloudinary
```

Expected: package installed, no errors.

- [ ] **Step 2: Add env vars to .env.example**

Add these three lines to `.env.example`:

```
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

- [ ] **Step 3: Replace upload.service.ts**

```typescript
// src/upload/upload.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

const UPLOAD_FOLDER_MAP: Record<string, string> = {
  avatar: 'mquid/avatars',
  'blog-image': 'mquid/blog-images',
  'og-image': 'mquid/og-images',
};

const VALID_UPLOAD_TYPES = Object.keys(UPLOAD_FOLDER_MAP);

@Injectable()
export class UploadService {
  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.warn('[UploadService] Cloudinary env vars missing — uploads will fail');
    }

    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  }

  async upload(buffer: Buffer, mimetype: string, type: string): Promise<string> {
    if (!VALID_UPLOAD_TYPES.includes(type)) {
      throw new BadRequestException(`type must be one of: ${VALID_UPLOAD_TYPES.join(', ')}`);
    }

    const folder = UPLOAD_FOLDER_MAP[type];

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error: any, result: UploadApiResponse | undefined) => {
          if (error || !result) return reject(new BadRequestException('Upload failed'));
          resolve(result.secure_url);
        },
      );
      Readable.from(buffer).pipe(stream);
    });
  }
}
```

- [ ] **Step 4: Replace upload.controller.ts to use memoryStorage**

```typescript
// src/upload/upload.controller.ts
import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const VALID_UPLOAD_TYPES = ['avatar', 'blog-image', 'og-image'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

@ApiTags('upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Upload a file (avatar, blog-image, og-image)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
          cb(new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), false);
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: MAX_SIZE },
    }),
  )
  async uploadFile(
    @Query('type') type: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!VALID_UPLOAD_TYPES.includes(type)) {
      throw new BadRequestException(`type must be one of: ${VALID_UPLOAD_TYPES.join(', ')}`);
    }
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const url = await this.uploadService.upload(file.buffer, file.mimetype, type);
    return { url };
  }
}
```

- [ ] **Step 5: Remove upload.constants.ts (no longer needed)**

The constants file `src/upload/upload.constants.ts` is now inlined in the service. Delete it:

```powershell
Remove-Item src/upload/upload.constants.ts
```

- [ ] **Step 6: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: 0 errors. If there are import errors for `upload.constants.ts` from the old controller, they should be gone since the controller is fully replaced.

- [ ] **Step 7: Run all tests**

```powershell
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```powershell
git add src/upload/ .env.example
git commit -m "feat: migrate file upload to Cloudinary cloud storage"
```

---

### Task 7: Prisma migration + final push

- [ ] **Step 1: Confirm migration ran (from Task 1)**

```powershell
npx prisma migrate status
```

Expected: `All migrations have been applied.`

- [ ] **Step 2: Run full test suite**

```powershell
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Build**

```powershell
npm run build
```

Expected: build succeeds with 0 errors.

- [ ] **Step 4: Push to GitHub**

```powershell
git push
```

Expected: pushed to origin master.

- [ ] **Step 5: Add Cloudinary env vars to Render**

In Render → your service → Environment, add:
- `CLOUDINARY_CLOUD_NAME` — from cloudinary.com dashboard
- `CLOUDINARY_API_KEY` — from cloudinary.com dashboard
- `CLOUDINARY_API_SECRET` — from cloudinary.com dashboard

Trigger a redeploy after adding.
