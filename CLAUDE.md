# MyMquid Elevate — Backend Build Instructions for Claude Code

> Drop this file at the root of your NestJS project. Claude Code will read it automatically.

---

## 🎯 Objective

Build the **complete NestJS backend** for the MyMquid Elevate admin platform.  
Stack: **NestJS · TypeScript · PostgreSQL · TablePlus (local DB) · TypeORM · JWT**  
The frontend already exists (React 19 + Vite). You are building the backend only.

---

## 📁 Required Folder Structure

Scaffold the project with this exact structure. Do NOT deviate:

```
src/
├── main.ts
├── app.module.ts
├── app.controller.ts          # health check only
├── app.service.ts
│
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   └── roles.decorator.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── roles.guard.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── interceptors/
│   │   └── transform.interceptor.ts
│   ├── pipes/
│   │   └── validation.pipe.ts
│   ├── dto/
│   │   └── pagination.dto.ts
│   └── interfaces/
│       └── paginated-response.interface.ts
│
├── config/
│   ├── database.config.ts
│   └── jwt.config.ts
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   ├── dto/
│   │   ├── login.dto.ts
│   │   ├── forgot-password.dto.ts
│   │   └── reset-password.dto.ts
│   └── entities/
│       └── password-reset-token.entity.ts
│
├── users/
│   ├── users.module.ts
│   ├── users.service.ts
│   └── entities/
│       └── user.entity.ts
│
├── blog/
│   ├── blog.module.ts
│   ├── blog.controller.ts
│   ├── blog.service.ts
│   ├── dto/
│   │   ├── create-blog-post.dto.ts
│   │   └── update-blog-post.dto.ts
│   └── entities/
│       └── blog-post.entity.ts
│
├── dashboard/
│   ├── dashboard.module.ts
│   ├── dashboard.controller.ts
│   ├── dashboard.service.ts
│   └── entities/
│       └── activity-event.entity.ts
│
├── notifications/
│   ├── notifications.module.ts
│   ├── notifications.controller.ts
│   ├── notifications.service.ts
│   └── entities/
│       └── notification.entity.ts
│
└── profile/
    ├── profile.module.ts
    ├── profile.controller.ts
    ├── profile.service.ts
    └── dto/
        ├── update-profile.dto.ts
        └── change-password.dto.ts
```

---

## 🗄️ Database: PostgreSQL via TablePlus

- Use **TypeORM** with `synchronize: true` for development (TypeORM auto-creates tables)
- Read all DB credentials from `.env` — never hardcode them
- Use UUIDs (`uuid_generate_v4()`) for all primary keys

### Environment Variables (`.env`)
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=mymquid_db

# JWT
JWT_SECRET=your_super_secret_key_min_32_chars
JWT_EXPIRES_IN=7d

# App
PORT=3000
NODE_ENV=development

# Frontend origins (CORS)
FRONTEND_ORIGIN=http://localhost:5173
```

### Also create `.env.example` with the same keys but blank values.

---

## 🗃️ Entities / Data Models

Mirror these TypeScript types exactly. The frontend depends on these shapes.

### `user.entity.ts`
```typescript
@Entity('admin_users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column({ unique: true }) email: string;
  @Column() password: string; // bcrypt hash — NEVER return this field
  @Column({ type: 'enum', enum: ['super_admin', 'staff'], default: 'staff' }) role: 'super_admin' | 'staff';
  @Column({ nullable: true }) avatar: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```
**CRITICAL:** Always use a `toJSON()` / `@Exclude()` pattern (class-transformer) so `password` is NEVER returned in any API response.

### `blog-post.entity.ts`
```typescript
@Entity('blog_posts')
export class BlogPost {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 200 }) title: string;
  @Column({ unique: true }) slug: string;
  @Column({ type: 'text' }) content: string; // Tiptap JSON string — store as TEXT, never parse
  @Column({ type: 'enum', enum: ['draft', 'published', 'scheduled'] }) status: string;
  @Column() category: string;
  @Column({ type: 'simple-array', nullable: true }) tags: string[];
  @Column({ nullable: true }) featuredImage: string;
  // SEO — store as embedded columns (not a separate table)
  @Column({ length: 60 }) metaTitle: string;
  @Column({ length: 160 }) metaDescription: string;
  @Column({ nullable: true }) ogImage: string;
  @Column({ type: 'timestamptz', nullable: true }) scheduledAt: Date;
  @ManyToOne(() => User) author: User;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

### `activity-event.entity.ts`
```typescript
@Entity('activity_events')
export class ActivityEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'enum', enum: ['publish', 'draft', 'login', 'delete', 'edit'] }) type: string;
  @Column() message: string;
  @ManyToOne(() => User) user: User;
  @CreateDateColumn() createdAt: Date;
}
```

### `notification.entity.ts`
```typescript
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() title: string;
  @Column() message: string;
  @Column({ type: 'enum', enum: ['info', 'success', 'warning', 'error'] }) type: string;
  @Column({ default: false }) read: boolean;
  @ManyToOne(() => User) user: User;
  @CreateDateColumn() createdAt: Date;
}
```

### `password-reset-token.entity.ts`
```typescript
@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) token: string;
  @ManyToOne(() => User) user: User;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ default: false }) used: boolean;
  @CreateDateColumn() createdAt: Date;
}
```

---

## 🔐 Authentication

### JWT Strategy
- Use `@nestjs/passport` + `passport-jwt`
- JWT payload: `{ sub: user.id, email: user.email, role: user.role }`
- Token stored by frontend in localStorage; interceptor attaches it as `Authorization: Bearer <token>`
- No refresh token required for v1 (7-day expiry is fine)

### Password Reset Flow
1. `POST /auth/forgot-password` → generate a random token (crypto.randomUUID or nanoid), store hash in `password_reset_tokens` table, set `expiresAt` to 1 hour from now
2. In dev: **log the token to console** (no email service needed yet — add a `// TODO: send email` comment)
3. `POST /auth/reset-password` → verify token, check not expired, check not used, update password with bcrypt, mark token used

### Guards
- `JwtAuthGuard` — default guard, apply globally via `APP_GUARD` in `app.module.ts`
- `RolesGuard` — checks `@Roles('super_admin')` decorator
- Mark public routes with `@Public()` custom decorator (sets metadata `isPublic: true`)

---

## 📝 Blog API

### Response Shape
The frontend expects the `seo` field as a nested object:
```json
{
  "seo": {
    "metaTitle": "...",
    "metaDescription": "...",
    "ogImage": null
  }
}
```
Map the flat DB columns (`metaTitle`, `metaDescription`, `ogImage`) to this nested shape in the service layer before returning.

### Slug Validation
- Regex: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
- On `PUT /blog/:id` slug conflict check: exclude the current post's own slug from the uniqueness check

### Staff Restrictions
- `PUT /blog/:id` — if `user.role === 'staff'`, verify `post.author.id === user.id`, else throw `ForbiddenException`
- `DELETE /blog/:id` — only `super_admin`; enforced by `@Roles('super_admin')` guard

### Activity Logging
Call `DashboardService.logActivity(type, message, user)` after:
- Post created as draft → `{ type: 'draft', message: 'Post saved as draft: <title>' }`
- Post published → `{ type: 'publish', message: 'Post published: <title>' }`
- Post updated → `{ type: 'edit', message: 'Post updated: <title>' }`
- Post deleted → `{ type: 'delete', message: 'Post deleted: <title>' }`
- User logged in → `{ type: 'login', message: 'Admin logged in: <name>' }`

### Categories (hardcoded for v1)
```typescript
export const BLOG_CATEGORIES = ['Company News', 'Solutions', 'Insights', 'Case Studies'];
```
Validate `category` against this array in the DTO with a custom `@IsIn(BLOG_CATEGORIES)` decorator.

---

## 📊 Dashboard API

### `GET /dashboard/chart`
- Query param: `days` (default 30, max 90)
- Use a date-series query — generate every date in range and LEFT JOIN with post counts
- **Always return exactly `days` entries**, filling gaps with `{ date: 'YYYY-MM-DD', posts: 0 }`
- Example PostgreSQL query:
```sql
SELECT 
  to_char(d::date, 'YYYY-MM-DD') AS date,
  COALESCE(COUNT(p.id), 0)::int AS posts
FROM generate_series(
  NOW() - INTERVAL '${days} days',
  NOW(),
  INTERVAL '1 day'
) AS d
LEFT JOIN blog_posts p ON DATE(p.created_at) = d::date
GROUP BY d
ORDER BY d ASC;
```

### `GET /dashboard/activity`
- Returns 20 most recent `ActivityEvent` records, sorted `createdAt DESC`
- The `time` field: compute a relative time string server-side (e.g. "2h ago", "3d ago") — use a simple helper function

---

## 🔔 Notifications API

### Route Registration Order (CRITICAL for NestJS)
Register `/notifications/read-all` BEFORE `/:id/read` in the controller to prevent NestJS matching `"read-all"` as an `:id` param:

```typescript
@Patch('read-all')         // must come first
markAllAsRead() { ... }

@Patch(':id/read')         // comes second
markOneAsRead() { ... }
```

---

## 👤 Profile API

- `GET /profile` and `PUT /profile` operate on `req.user` from JWT — never accept a user ID from the request body
- `PUT /profile/password` — always verify `currentPassword` with `bcrypt.compare` before updating

---

## 🌐 Global Setup (`main.ts`)

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS
  app.enableCors({
    origin: [process.env.FRONTEND_ORIGIN, 'https://mymquid.com'],
    credentials: true,
  });

  // Validation pipe (global)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Global exception filter (custom error shape)
  app.useGlobalFilters(new HttpExceptionFilter());

  // class-transformer (for @Exclude on password)
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  await app.listen(process.env.PORT || 3000);
}
```

---

## ❌ Error Response Format

All errors must follow this shape (implement in `HttpExceptionFilter`):
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "must be a valid email" }
  ]
}
```

---

## 📦 Pagination

All list endpoints accept `?page=1&limit=10` and return:
```json
{
  "data": [...],
  "total": 42,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

Create a reusable `PaginationDto` with `@IsOptional() @Type(() => Number) @IsInt() @Min(1) page` and `limit` (max 100).

---

## 🌱 Database Seeding

Create `src/database/seed.ts` that:
1. Creates one `super_admin` user: `{ name: 'Patrick Evra', email: 'admin@mymquid.com', password: bcrypt('Admin1234!') }`
2. Creates 3–5 sample `BlogPost` records (mix of draft/published/scheduled)
3. Creates 3 sample `Notification` records
4. Run with: `npx ts-node src/database/seed.ts`

---

## 📦 Required npm Packages

Install these (all versions latest stable):
```bash
npm install @nestjs/typeorm typeorm pg
npm install @nestjs/passport @nestjs/jwt passport passport-jwt
npm install @nestjs/config
npm install class-validator class-transformer
npm install bcrypt
npm install @types/bcrypt @types/passport-jwt --save-dev
```

---

## ✅ Implementation Checklist

Claude Code: work through these in order.

- [ ] Scaffold NestJS project (`nest new mymquid-backend`)
- [ ] Install all required packages
- [ ] Create `.env` and `.env.example`
- [ ] Set up `ConfigModule` (global) and `DatabaseModule` with TypeORM
- [ ] Create all entities (User, BlogPost, ActivityEvent, Notification, PasswordResetToken)
- [ ] Build `common/` layer (guards, decorators, filter, pipe, interceptor, pagination DTO)
- [ ] Implement `UsersModule` (service only — no controller; used by auth and profile)
- [ ] Implement `AuthModule` (login, logout, forgot-password, reset-password, /auth/me)
- [ ] Implement `BlogModule` (full CRUD + /blog/public, with RBAC and activity logging)
- [ ] Implement `DashboardModule` (stats, activity, chart)
- [ ] Implement `NotificationsModule` (list, read-one, read-all — correct route order)
- [ ] Implement `ProfileModule` (get, update name/email, change password)
- [ ] Configure `main.ts` (global prefix, CORS, pipes, filters, interceptors)
- [ ] Create database seed script
- [ ] Write `README.md` with setup and run instructions

---

## 🚫 Do NOT

- Do NOT build any frontend code
- Do NOT use GraphQL — REST only
- Do NOT use Prisma — use TypeORM
- Do NOT hardcode credentials — always use `process.env`
- Do NOT return the `password` field in any response (use `@Exclude()`)
- Do NOT parse the blog `content` field on the server — store and return as-is (TEXT)
- Do NOT create a separate `seo` table — use flat columns on `blog_posts`, map to nested object in response
- Do NOT put business logic in controllers — controllers call services only

---

## 📝 README.md

Generate a `README.md` covering:
1. Prerequisites (Node 20+, PostgreSQL 15+)
2. Clone & install
3. Create `.env` from `.env.example`
4. Create the database in TablePlus (name: `mymquid_db`)
5. `npm run start:dev` — TypeORM auto-creates tables
6. `npx ts-node src/database/seed.ts` — seed data
7. API base URL: `http://localhost:3000/api/v1`
8. Default login: `admin@mymquid.com` / `Admin1234!`
