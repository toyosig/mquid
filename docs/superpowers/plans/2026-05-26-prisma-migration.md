# Prisma Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TypeORM entirely with Prisma, using `prisma/schema.prisma` for the schema and `PrismaService` for all database access.

**Architecture:** Remove `typeorm` and `@nestjs/typeorm` packages. Create a global `PrismaModule` exposing a singleton `PrismaService extends PrismaClient`. Rewrite all five services (`users`, `auth`, `blog`, `dashboard`, `notifications`) to inject `PrismaService` instead of `@InjectRepository`. Delete all entity files. Controllers, DTOs, guards, and `main.ts` are untouched. Run `prisma migrate dev` to generate the initial SQL migration from the schema.

**Tech Stack:** Prisma 5.x, `@prisma/client`, `prisma` (dev), PostgreSQL, NestJS 10, Jest

---

### Task 1: Install Prisma, write schema, generate client

**Files:**
- Create: `prisma/schema.prisma`
- Modify: `.env`

- [ ] **Step 1: Install packages**

```bash
cd c:\Mquid_backend
npm install @prisma/client
npm install prisma --save-dev
```

Expected: both packages appear in `package.json`.

- [ ] **Step 2: Initialize Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` (with a stub) and adds `DATABASE_URL` to `.env`. If `.env` already exists the variable is appended.

- [ ] **Step 3: Add DATABASE_URL to `.env`**

Open `c:\Mquid_backend\.env` and add this line (replace password with your actual PostgreSQL password):

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/mymquid_db"
```

- [ ] **Step 4: Replace `prisma/schema.prisma` with the full schema**

```prisma
generator client {
  provider = "prisma-client-js"
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
  password            String
  role                UserRole             @default(staff)
  avatar              String?
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  blogPosts           BlogPost[]
  activityEvents      ActivityEvent[]
  notifications       Notification[]
  passwordResetTokens PasswordResetToken[]

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

  @@map("blog_posts")
}

model ActivityEvent {
  id        String       @id @default(uuid())
  type      ActivityType
  message   String
  user      User         @relation(fields: [userId], references: [id])
  userId    String
  createdAt DateTime     @default(now())

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
```

- [ ] **Step 5: Validate the schema**

```bash
npx prisma validate
```

Expected output: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 6: Generate the Prisma client** (no DB connection needed)

```bash
npx prisma generate
```

Expected: generates TypeScript types in `node_modules/@prisma/client`. Output includes "Generated Prisma Client".

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma package.json package-lock.json
git commit -m "feat: add Prisma schema and generate client"
```

---

### Task 2: PrismaService + PrismaModule + rewrite AppModule

**Files:**
- Create: `src/prisma/prisma.service.ts`
- Create: `src/prisma/prisma.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create `src/prisma/prisma.service.ts`**

```typescript
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 2: Create `src/prisma/prisma.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`@Global()` means all feature modules can inject `PrismaService` without importing `PrismaModule` themselves.

- [ ] **Step 3: Rewrite `src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BlogModule } from './blog/blog.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import jwtConfig from './config/jwt.config';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [jwtConfig],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    AuthModule,
    BlogModule,
    DashboardModule,
    NotificationsModule,
    ProfileModule,
    UploadModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
```

Note: `TypeOrmModule` and `databaseConfig` are removed. `database.config.ts` will be deleted in Task 8.

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: errors only about missing entity files / typeorm imports in services not yet migrated — NOT errors in the files you just created.

- [ ] **Step 5: Commit**

```bash
git add src/prisma/ src/app.module.ts
git commit -m "feat: add PrismaModule and wire into AppModule"
```

---

### Task 3: Rewrite UsersService + update spec + update UsersModule

**Files:**
- Modify: `src/users/users.service.ts`
- Modify: `src/users/users.service.spec.ts`
- Modify: `src/users/users.module.ts`

- [ ] **Step 1: Write the new spec first**

Replace `src/users/users.service.spec.ts` entirely:

```typescript
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
    });
    expect(result).toEqual(mockUser);
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
```

- [ ] **Step 2: Run spec to see it fail**

```bash
npx jest users/users.service --passWithNoTests 2>&1
```

Expected: FAIL — "Cannot find module '../prisma/prisma.service'" (or similar import errors)

- [ ] **Step 3: Rewrite `src/users/users.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
}
```

- [ ] **Step 4: Update `src/users/users.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 5: Run spec to see it pass**

```bash
npx jest users/users.service --passWithNoTests 2>&1
```

Expected: 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/users/users.service.ts src/users/users.service.spec.ts src/users/users.module.ts
git commit -m "feat: rewrite UsersService with Prisma"
```

---

### Task 4: Rewrite AuthService + AuthModule + update auth spec

**Files:**
- Modify: `src/auth/auth.service.ts`
- Modify: `src/auth/auth.service.spec.ts`
- Modify: `src/auth/auth.module.ts`

- [ ] **Step 1: Rewrite `src/auth/auth.service.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

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

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = this.jwtService.sign(payload);

    await this.dashboardService.logActivity('login', `Admin logged in: ${user.name}`, user);

    const { password: _pw, ...userSafe } = user;
    return { access_token, user: userSafe };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) return;

    const rawToken = crypto.randomUUID();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { token: tokenHash, userId: user.id, expiresAt },
    });

    // TODO: send email with rawToken
    console.log('[DEV] Password reset token:', rawToken);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!record || record.used || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.update(record.user.id, { password: hashed });

    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { used: true },
    });
  }
}
```

- [ ] **Step 2: Rewrite `src/auth/auth.service.spec.ts`**

```typescript
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
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService - login', () => {
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
    const result = await service.login({ email: mockUser.email, password: 'Admin1234!' });
    expect(result.access_token).toBe('jwt-token');
    expect(result.user.email).toBe(mockUser.email);
    expect(result.user).not.toHaveProperty('password');
    expect(dashboardService.logActivity).toHaveBeenCalledWith(
      'login',
      expect.stringContaining('Patrick Evra'),
      mockUser,
    );
  });
});
```

- [ ] **Step 3: Rewrite `src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { DashboardModule } from '../dashboard/dashboard.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get('jwt.expiresIn') as any },
      }),
    }),
    UsersModule,
    DashboardModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
```

Note: `TypeOrmModule.forFeature([PasswordResetToken])` removed. `PrismaService` is injected via the global `PrismaModule`.

- [ ] **Step 4: Run auth spec**

```bash
npx jest auth/auth.service --passWithNoTests 2>&1
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.service.spec.ts src/auth/auth.module.ts
git commit -m "feat: rewrite AuthService with Prisma"
```

---

### Task 5: Rewrite BlogService + update spec + update BlogModule

**Files:**
- Modify: `src/blog/blog.service.ts`
- Modify: `src/blog/blog.service.spec.ts`
- Modify: `src/blog/blog.module.ts`

- [ ] **Step 1: Rewrite `src/blog/blog.service.spec.ts`**

```typescript
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BlogService } from './blog.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

const mockAuthor = { id: 'user-1', role: 'staff', name: 'Staff User' };
const mockAdmin = { id: 'admin-1', role: 'super_admin', name: 'Admin' };
const mockPost = {
  id: 'post-1',
  title: 'Test Post',
  slug: 'test-post',
  status: 'draft',
  authorId: 'user-1',
  author: mockAuthor,
  metaTitle: 'SEO Title',
  metaDescription: 'SEO Desc',
  ogImage: null,
  content: '{}',
  category: 'Insights',
  tags: [],
  featuredImage: null,
  scheduledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  blogPost: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};
const dashboardService = { logActivity: jest.fn() };

describe('BlogService', () => {
  let service: BlogService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BlogService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DashboardService, useValue: dashboardService },
      ],
    }).compile();
    service = module.get(BlogService);
    jest.clearAllMocks();
  });

  describe('mapToResponse', () => {
    it('maps flat SEO columns to nested seo object', () => {
      const result = service.mapToResponse(mockPost as any);
      expect(result.seo).toEqual({ metaTitle: 'SEO Title', metaDescription: 'SEO Desc', ogImage: null });
      expect(result).not.toHaveProperty('metaTitle');
      expect(result).not.toHaveProperty('metaDescription');
    });
  });

  describe('update', () => {
    it('throws NotFoundException when post does not exist', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(null);
      await expect(service.update('post-1', { title: 'New' }, mockAuthor as any)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when staff tries to edit another author post', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue({ ...mockPost, authorId: 'other-user' });
      await expect(
        service.update('post-1', { title: 'New' }, { id: 'user-1', role: 'staff' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows staff to edit their own post', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue({ ...mockPost, authorId: 'user-1' });
      mockPrisma.blogPost.update.mockResolvedValue({ ...mockPost, title: 'Updated', author: mockAuthor });
      await expect(service.update('post-1', { title: 'Updated' }, mockAuthor as any)).resolves.toBeDefined();
    });

    it('allows super_admin to edit any post', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue({ ...mockPost, authorId: 'other-user' });
      mockPrisma.blogPost.update.mockResolvedValue({ ...mockPost, title: 'Updated', author: mockAuthor });
      await expect(service.update('post-1', { title: 'Updated' }, mockAdmin as any)).resolves.toBeDefined();
    });

    it('throws ConflictException when slug is already taken by another post', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue({ ...mockPost, authorId: 'user-1' });
      mockPrisma.blogPost.findFirst.mockResolvedValue({ id: 'other-post', slug: 'taken-slug' });
      await expect(
        service.update('post-1', { slug: 'taken-slug' }, mockAdmin as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when post does not exist', async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(null);
      await expect(service.remove('nonexistent', mockAdmin as any)).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run spec to see failures**

```bash
npx jest blog/blog.service --passWithNoTests 2>&1
```

Expected: FAIL — module import errors (PrismaService not yet used in blog.service.ts)

- [ ] **Step 3: Rewrite `src/blog/blog.service.ts`**

```typescript
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogPost, PostStatus, User } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

type BlogPostWithAuthor = BlogPost & { author: Omit<User, 'password'> };

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardService: DashboardService,
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
    await this.dashboardService.logActivity(activityType, activityMsg, author);

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
    await this.dashboardService.logActivity('edit', `Post updated: ${updated.title}`, user);

    return this.mapToResponse(updated as BlogPostWithAuthor);
  }

  async remove(id: string, user: User) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');
    await this.prisma.blogPost.delete({ where: { id } });
    await this.dashboardService.logActivity('delete', `Post deleted: ${post.title}`, user);
  }

  mapToResponse(post: BlogPostWithAuthor) {
    const { metaTitle, metaDescription, ogImage, author, ...rest } = post;
    return { ...rest, author, seo: { metaTitle, metaDescription, ogImage } };
  }
}
```

- [ ] **Step 4: Update `src/blog/blog.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

@Module({
  imports: [DashboardModule],
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
```

- [ ] **Step 5: Run spec**

```bash
npx jest blog/blog.service --passWithNoTests 2>&1
```

Expected: 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/blog/blog.service.ts src/blog/blog.service.spec.ts src/blog/blog.module.ts
git commit -m "feat: rewrite BlogService with Prisma"
```

---

### Task 6: Rewrite DashboardService + update spec + update DashboardModule

**Files:**
- Modify: `src/dashboard/dashboard.service.ts`
- Modify: `src/dashboard/dashboard.service.spec.ts`
- Modify: `src/dashboard/dashboard.module.ts`

- [ ] **Step 1: Rewrite `src/dashboard/dashboard.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ActivityType, Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [totalPosts, publishedPosts, draftPosts, totalUsers] = await Promise.all([
      this.prisma.blogPost.count(),
      this.prisma.blogPost.count({ where: { status: 'published' } }),
      this.prisma.blogPost.count({ where: { status: 'draft' } }),
      this.prisma.user.count(),
    ]);
    return { totalPosts, publishedPosts, draftPosts, totalUsers };
  }

  async getActivity() {
    const events = await this.prisma.activityEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { omit: { password: true } } },
    });
    return events.map((e) => ({ ...e, time: this.relativeTime(e.createdAt) }));
  }

  async getChart(days: number) {
    const interval = `${days} days`;
    return this.prisma.$queryRaw<{ date: string; posts: number }[]>(
      Prisma.sql`
        SELECT
          to_char(d::date, 'YYYY-MM-DD') AS date,
          COALESCE(COUNT(p.id), 0)::int AS posts
        FROM generate_series(
          NOW() - CAST(${interval} AS interval),
          NOW(),
          INTERVAL '1 day'
        ) AS d
        LEFT JOIN blog_posts p ON DATE(p.created_at) = d::date
        GROUP BY d
        ORDER BY d ASC
      `,
    );
  }

  async logActivity(type: ActivityType, message: string, user: User): Promise<void> {
    await this.prisma.activityEvent.create({
      data: { type, message, userId: user.id },
    });
  }

  relativeTime(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
}
```

- [ ] **Step 2: Rewrite `src/dashboard/dashboard.service.spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  blogPost: { count: jest.fn(), $queryRaw: jest.fn() },
  user: { count: jest.fn() },
  activityEvent: { findMany: jest.fn(), create: jest.fn() },
  $queryRaw: jest.fn(),
};

describe('DashboardService - relativeTime', () => {
  let service: DashboardService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(DashboardService);
  });

  it('returns "just now" for recent events', () => {
    expect(service.relativeTime(new Date())).toBe('just now');
  });

  it('returns minutes ago', () => {
    const d = new Date(Date.now() - 5 * 60 * 1000);
    expect(service.relativeTime(d)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(service.relativeTime(d)).toBe('3h ago');
  });

  it('returns days ago', () => {
    const d = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(service.relativeTime(d)).toBe('2d ago');
  });
});
```

- [ ] **Step 3: Update `src/dashboard/dashboard.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
```

- [ ] **Step 4: Run spec**

```bash
npx jest dashboard/dashboard.service --passWithNoTests 2>&1
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/dashboard.service.ts src/dashboard/dashboard.service.spec.ts src/dashboard/dashboard.module.ts
git commit -m "feat: rewrite DashboardService with Prisma"
```

---

### Task 7: Rewrite NotificationsService + update spec + update NotificationsModule

**Files:**
- Modify: `src/notifications/notifications.service.ts`
- Modify: `src/notifications/notifications.service.spec.ts`
- Modify: `src/notifications/notifications.module.ts`

- [ ] **Step 1: Rewrite `src/notifications/notifications.service.spec.ts`**

```typescript
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const mockUserId = 'user-uuid-1';
const mockNotif = {
  id: 'notif-1',
  title: 'Test',
  message: 'Test msg',
  type: 'info' as const,
  read: false,
  userId: mockUserId,
  createdAt: new Date(),
};

const mockPrisma = {
  notification: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(NotificationsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns paginated notifications for the correct user', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockNotif], 1]);
      const pagination: PaginationDto = { page: 1, limit: 10 };
      const result = await service.findAll(mockUserId, pagination);
      expect(result.data).toEqual([mockNotif]);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('markOneAsRead', () => {
    it('marks notification read and returns it', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(mockNotif);
      mockPrisma.notification.update.mockResolvedValue({ ...mockNotif, read: true });
      const result = await service.markOneAsRead('notif-1', mockUserId);
      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: mockUserId },
      });
      expect(result.read).toBe(true);
    });

    it('throws NotFoundException when notification not found', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      await expect(service.markOneAsRead('bad-id', mockUserId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllAsRead', () => {
    it('returns { updated: N }', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });
      const result = await service.markAllAsRead(mockUserId);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, read: false },
        data: { read: true },
      });
      expect(result).toEqual({ updated: 3 });
    });
  });
});
```

- [ ] **Step 2: Run spec to see failures**

```bash
npx jest notifications/notifications.service --passWithNoTests 2>&1
```

Expected: FAIL

- [ ] **Step 3: Rewrite `src/notifications/notifications.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { Notification } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, pagination: PaginationDto) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async markOneAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with id "${id}" not found or does not belong to you`);
    }

    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { updated: result.count };
  }
}
```

- [ ] **Step 4: Update `src/notifications/notifications.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 5: Run spec**

```bash
npx jest notifications/notifications.service --passWithNoTests 2>&1
```

Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/notifications/notifications.service.ts src/notifications/notifications.service.spec.ts src/notifications/notifications.module.ts
git commit -m "feat: rewrite NotificationsService with Prisma"
```

---

### Task 8: Update entity imports, delete entity files, uninstall TypeORM

**Files:**
- Modify: `src/blog/blog.controller.ts` (User import)
- Modify: `src/notifications/notifications.controller.ts` (User import)
- Modify: `src/profile/profile.controller.ts` (User import)
- Modify: `src/profile/profile.service.ts` (User import)
- Modify: `src/profile/profile.service.spec.ts` (User import)
- Delete: `src/users/entities/user.entity.ts`
- Delete: `src/blog/entities/blog-post.entity.ts`
- Delete: `src/dashboard/entities/activity-event.entity.ts`
- Delete: `src/notifications/entities/notification.entity.ts`
- Delete: `src/auth/entities/password-reset-token.entity.ts`
- Delete: `src/config/database.config.ts`

- [ ] **Step 1: Update `src/blog/blog.controller.ts` — change User import**

Find this line:
```typescript
import { User } from '../users/entities/user.entity';
```
Replace with:
```typescript
import { User } from '@prisma/client';
```

- [ ] **Step 2: Update `src/notifications/notifications.controller.ts` — change User import**

Find this line:
```typescript
import { User } from '../users/entities/user.entity';
```
Replace with:
```typescript
import { User } from '@prisma/client';
```

- [ ] **Step 3: Update `src/profile/profile.controller.ts` — change User import**

Find this line:
```typescript
import { User } from '../users/entities/user.entity';
```
Replace with:
```typescript
import { User } from '@prisma/client';
```

- [ ] **Step 4: Update `src/profile/profile.service.ts` — change User import**

Find this line:
```typescript
import { User } from '../users/entities/user.entity';
```
Replace with:
```typescript
import { User } from '@prisma/client';
```

- [ ] **Step 5: Update `src/profile/profile.service.spec.ts` — change User import and update mock**

Find this line:
```typescript
import { User } from '../users/entities/user.entity';
```
Replace with:
```typescript
import { User } from '@prisma/client';
```

Also find the `mockUser` object and add the `password` field (required by Prisma's `User` type even though it's not used in profile tests):
```typescript
const mockUser: Partial<User> = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'staff',
  avatar: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
```
(Keep `Partial<User>` — avoids needing to include `password` in the mock.)

- [ ] **Step 6: Delete entity files**

```bash
rm src/users/entities/user.entity.ts
rm src/blog/entities/blog-post.entity.ts
rm src/dashboard/entities/activity-event.entity.ts
rm src/notifications/entities/notification.entity.ts
rm src/auth/entities/password-reset-token.entity.ts
rm src/config/database.config.ts
```

On Windows PowerShell:
```powershell
Remove-Item src\users\entities\user.entity.ts
Remove-Item src\blog\entities\blog-post.entity.ts
Remove-Item src\dashboard\entities\activity-event.entity.ts
Remove-Item src\notifications\entities\notification.entity.ts
Remove-Item src\auth\entities\password-reset-token.entity.ts
Remove-Item src\config\database.config.ts
```

- [ ] **Step 7: Uninstall TypeORM packages**

```bash
npm uninstall typeorm @nestjs/typeorm
```

- [ ] **Step 8: Full TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: zero errors. If any remain, they are import references to deleted entity files — fix them by updating the import to use `@prisma/client` types.

- [ ] **Step 9: Run full test suite**

```bash
npx jest --passWithNoTests 2>&1
```

Expected: all tests PASS across all suites.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: remove TypeORM, delete entity files, update all imports to @prisma/client"
```

---

### Task 9: Run migration + rewrite seed script + add npm scripts

**Files:**
- Modify: `src/database/seed.ts`
- Modify: `package.json`

- [ ] **Step 1: Run the initial Prisma migration** (requires database to be running with correct `DATABASE_URL`)

```bash
npx prisma migrate dev --name init
```

This creates `prisma/migrations/<timestamp>_init/migration.sql` with all `CREATE TABLE` and `CREATE TYPE` statements.

Expected output:
```
Applying migration `<timestamp>_init`
Your database is now in sync with your schema.
```

- [ ] **Step 2: Rewrite `src/database/seed.ts`**

```typescript
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

dotenv.config({ path: resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function seed() {
  // Admin user (idempotent)
  let admin = await prisma.user.findUnique({ where: { email: 'admin@mymquid.com' } });
  if (!admin) {
    const hashed = await bcrypt.hash('Admin1234!', 10);
    admin = await prisma.user.create({
      data: {
        name: 'Patrick Evra',
        email: 'admin@mymquid.com',
        password: hashed,
        role: 'super_admin',
      },
    });
    console.log('Created admin user');
  } else {
    console.log('Admin user already exists, skipping');
  }

  // Blog posts (idempotent by slug)
  const posts = [
    {
      title: 'Welcome to MyMquid Elevate',
      slug: 'welcome-to-mymquid-elevate',
      content: '{}',
      status: 'published' as const,
      category: 'Company News',
      tags: ['welcome', 'platform'],
      metaTitle: 'Welcome to MyMquid Elevate',
      metaDescription: 'Get started with the MyMquid Elevate admin platform.',
      authorId: admin.id,
    },
    {
      title: 'How to Maximise Your Performance',
      slug: 'how-to-maximise-your-performance',
      content: '{}',
      status: 'published' as const,
      category: 'Insights',
      tags: ['performance', 'tips'],
      metaTitle: 'How to Maximise Your Performance',
      metaDescription: 'Practical tips to elevate your performance with MyMquid.',
      authorId: admin.id,
    },
    {
      title: 'Case Study: Acme Corp Transformation',
      slug: 'case-study-acme-corp-transformation',
      content: '{}',
      status: 'draft' as const,
      category: 'Case Studies',
      tags: ['case-study', 'enterprise'],
      metaTitle: 'Case Study: Acme Corp Transformation',
      metaDescription: 'How Acme Corp transformed with MyMquid Elevate.',
      authorId: admin.id,
    },
    {
      title: 'Upcoming Platform Updates',
      slug: 'upcoming-platform-updates',
      content: '{}',
      status: 'scheduled' as const,
      category: 'Company News',
      tags: ['updates', 'roadmap'],
      metaTitle: 'Upcoming Platform Updates',
      metaDescription: 'A preview of upcoming features and improvements.',
      scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      authorId: admin.id,
    },
  ];

  for (const postData of posts) {
    const existing = await prisma.blogPost.findUnique({ where: { slug: postData.slug } });
    if (!existing) {
      await prisma.blogPost.create({ data: postData });
      console.log(`Created post: ${postData.title}`);
    }
  }

  // Notifications
  const notifs = [
    { title: 'Platform ready', message: 'MyMquid Elevate backend is up and running.', type: 'success' as const },
    { title: 'New post published', message: 'Welcome post has been published successfully.', type: 'info' as const },
    { title: 'Seed complete', message: 'Database seeded with sample data.', type: 'info' as const },
  ];
  for (const n of notifs) {
    await prisma.notification.create({ data: { ...n, userId: admin.id } });
  }
  console.log('Created notifications');

  await prisma.$disconnect();
  console.log('Seed complete!');
}

seed().catch(async (err) => {
  console.error('Seed failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
```

- [ ] **Step 3: Add Prisma scripts to `package.json`**

In the `"scripts"` section of `package.json`, add:

```json
"prisma:migrate": "prisma migrate dev",
"prisma:generate": "prisma generate",
"prisma:studio": "prisma studio",
"seed": "npx ts-node -r tsconfig-paths/register src/database/seed.ts"
```

(Replace the existing `"seed"` script if it already exists.)

- [ ] **Step 4: TypeScript check on seed script**

```bash
npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 5: Run full test suite**

```bash
npx jest --passWithNoTests 2>&1
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/database/seed.ts package.json prisma/migrations/
git commit -m "feat: run initial Prisma migration and rewrite seed script"
```

---

## Post-migration verification

After all tasks are complete, start the app:

```bash
npm run start:dev
```

Expected:
- No TypeORM connection errors
- Log shows: `Application running on: http://localhost:3000/api/v1`
- Swagger UI loads at: `http://localhost:3000/api/docs`

Then seed:
```bash
npm run seed
```

Expected: "Seed complete!"

Test login via curl or Swagger:
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mymquid.com","password":"Admin1234!"}'
```

Expected: `{ "access_token": "...", "user": { "id": "...", "email": "admin@mymquid.com", ... } }` — no `password` field in response.
