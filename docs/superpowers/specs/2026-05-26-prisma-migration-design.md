# Prisma Migration Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace TypeORM with Prisma as the ORM, using Prisma Migrate for schema management.

**Architecture:** Full replacement — TypeORM and `@nestjs/typeorm` are removed entirely. A global `PrismaModule` provides a singleton `PrismaService` (extends `PrismaClient`) to all feature modules. All entity files are deleted and replaced by `prisma/schema.prisma`. Controllers are untouched; only services change.

**Tech Stack:** Prisma 5.x, `@prisma/client`, PostgreSQL, NestJS 10

---

## Section 1: Prisma Schema & Data Models

### File: `prisma/schema.prisma`

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

### Key schema decisions

- **`tags String[]`** — Native PostgreSQL array, replaces TypeORM `simple-array` (which stored comma-separated text). Cleaner storage, properly queryable with `WHERE 'tag' = ANY(tags)`.
- **Enums** — Prisma `enum` blocks map to PostgreSQL native enums (same as TypeORM).
- **Password exclusion** — No `@Exclude()` or `select: false`. Instead, all user queries use `omit: { password: true }` at the query level. Only `findByEmailWithPassword` and `findByIdWithPassword` omit this omit to retrieve the hash for bcrypt comparison. This is explicit and cannot be silently bypassed.

---

## Section 2: PrismaService & PrismaModule

### `src/prisma/prisma.service.ts`

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

### `src/prisma/prisma.module.ts`

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

`@Global()` means feature modules (`UsersModule`, `BlogModule`, etc.) can inject `PrismaService` without importing `PrismaModule` individually.

### `src/app.module.ts` changes

- **Remove:** `TypeOrmModule.forRootAsync(...)`, `@nestjs/typeorm` import, `database.config.ts` load
- **Add:** `PrismaModule` to imports array
- `jwtConfig` and `ConfigModule` stay unchanged
- `ServeStaticModule`, all feature modules, guards — unchanged

### `.env` change

Remove individual `DB_*` variables. Add single Prisma connection string:

```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/mymquid_db"
```

The `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` variables are no longer used and can be removed.

---

## Section 3: Service Rewrites

All services follow this pattern:

```typescript
// Before
constructor(@InjectRepository(X) private repo: Repository<X>) {}

// After
constructor(private prisma: PrismaService) {}
```

Controllers are **not modified** — method signatures stay identical.

### UsersService (`src/users/users.service.ts`)

| Method | Prisma equivalent |
|--------|-------------------|
| `findByEmail(email)` | `prisma.user.findUnique({ where: { email }, omit: { password: true } })` |
| `findById(id)` | `prisma.user.findUnique({ where: { id }, omit: { password: true } })` |
| `findByEmailWithPassword(email)` | `prisma.user.findUnique({ where: { email } })` — no omit |
| `findByIdWithPassword(id)` | `prisma.user.findUnique({ where: { id } })` — no omit |
| `create(data)` | `prisma.user.create({ data })` |
| `update(id, data)` | `prisma.user.update({ where: { id }, data, omit: { password: true } })` |

### AuthService (`src/auth/auth.service.ts`)

`PasswordResetToken` repo becomes `prisma.passwordResetToken`. All `tokenRepo.*` calls map directly:
- `tokenRepo.create(...)` + `tokenRepo.save(...)` → `prisma.passwordResetToken.create({ data: { ... } })`
- `tokenRepo.findOne(...)` → `prisma.passwordResetToken.findUnique({ where: { token }, include: { user: true } })`
- `tokenRepo.save(record)` for marking used → `prisma.passwordResetToken.update({ where: { id }, data: { used: true } })`

### BlogService (`src/blog/blog.service.ts`)

- `findAndCount` → `prisma.$transaction([prisma.blogPost.findMany(...), prisma.blogPost.count(...)])`
- `blogPostRepo.findOne({ where: { id } })` → `prisma.blogPost.findUnique({ where: { id }, include: { author: { omit: { password: true } } } })`
- `blogPostRepo.save(...)` → `prisma.blogPost.create({ data })` / `prisma.blogPost.update({ where: { id }, data })`
- `blogPostRepo.remove(post)` → `prisma.blogPost.delete({ where: { id } })`
- Slug uniqueness check: `prisma.blogPost.findUnique({ where: { slug } })` — exclude current post via `where: { slug, NOT: { id } }`
- `mapToResponse` still needed — restructures `{ metaTitle, metaDescription, ogImage }` into `seo: {}` nested object, strips password from author

### DashboardService (`src/dashboard/dashboard.service.ts`)

- `blogPostRepo.count(...)` → `prisma.blogPost.count({ where: { status: '...' } })`
- `userRepo.count()` → `prisma.user.count()`
- `activityRepo.find(...)` → `prisma.activityEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })`
- `blogPostRepo.query(rawSQL)` → `prisma.$queryRaw\`...\`` (parameterized raw query, same SQL)
- `activityRepo.create(...)` + `save(...)` → `prisma.activityEvent.create({ data: { type, message, userId: user.id } })`

### NotificationsService (`src/notifications/notifications.service.ts`)

- `findAndCount` → `$transaction([findMany, count])` pattern
- `findOne({ where: { id, user: { id: userId } } })` → `prisma.notification.findFirst({ where: { id, userId } })`
- `update({ user: { id: userId }, read: false }, { read: true })` → `prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } })`

### ProfileService (`src/profile/profile.service.ts`)

Delegates to `UsersService` — no direct Prisma calls. No changes needed to method signatures.

---

## Section 4: Migration Workflow & Cleanup

### Migration commands

```bash
# Generate initial migration from schema + apply to DB
npx prisma migrate dev --name init

# Re-generate Prisma Client after schema changes
npx prisma generate

# Future schema changes
npx prisma migrate dev --name describe_change

# Inspect DB in browser
npx prisma studio
```

### `package.json` scripts to add

```json
"prisma:migrate": "prisma migrate dev",
"prisma:generate": "prisma generate",
"prisma:studio": "prisma studio",
"seed": "npx ts-node -r tsconfig-paths/register src/database/seed.ts"
```

### Seed script (`src/database/seed.ts`)

Rewritten to use `PrismaClient` directly instead of TypeORM `DataSource`. Same data, same idempotency logic (skip user/posts if already exist). Drops `reflect-metadata` import (not needed by Prisma).

### Files deleted

- `src/users/entities/user.entity.ts`
- `src/blog/entities/blog-post.entity.ts`
- `src/dashboard/entities/activity-event.entity.ts`
- `src/notifications/entities/notification.entity.ts`
- `src/auth/entities/password-reset-token.entity.ts`
- `src/config/database.config.ts`

### Packages

```bash
# Install
npm install @prisma/client
npm install prisma --save-dev

# Uninstall
npm uninstall typeorm @nestjs/typeorm
```

### `tsconfig.json`

No changes needed. `module: "commonjs"` is still required for NestJS decorators on controllers, services, and guards.

### `User` entity cleanup

Remove from `user.entity.ts` (being deleted):
- `@Exclude()` decorator — Prisma returns plain objects, not class instances
- `toJSON()` method — replaced by `omit: { password: true }` at query level
- `ClassSerializerInterceptor` in `main.ts` can be removed (or kept — it's harmless but inert for Prisma results)

---

## What Does NOT Change

- All controllers (`auth`, `blog`, `dashboard`, `notifications`, `profile`, `upload`)
- `main.ts` global setup (ValidationPipe, HttpExceptionFilter, CORS, Swagger)
- All DTOs
- JWT strategy and guards
- `HttpExceptionFilter`
- `PaginationDto`
- Upload module
- `AppController` health check
