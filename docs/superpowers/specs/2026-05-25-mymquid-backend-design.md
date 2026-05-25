# MyMquid Elevate — Backend Design Spec

**Date:** 2026-05-25  
**Stack:** NestJS · TypeScript · PostgreSQL · TypeORM · JWT · Swagger  
**Scope:** Complete v1 REST API backend for the MyMquid Elevate admin platform

---

## 1. Architecture & Module Map

The backend is a NestJS monolith. Every feature is a self-contained module. Modules communicate only through injected services — never by reaching into each other's repositories directly.

```
AppModule
├── ConfigModule (global)
├── TypeOrmModule (global, reads .env)
├── ServeStaticModule         ← serves /uploads as static assets
│
├── AuthModule                → JwtStrategy, guards, decorators
├── UsersModule               → User entity, UsersService (no controller)
├── BlogModule                → BlogPost entity, full CRUD
├── DashboardModule           → ActivityEvent entity, stats + chart
├── NotificationsModule       → Notification entity
├── ProfileModule             → operates on req.user from JWT
└── UploadModule              → POST /upload?type=, disk storage
```

### Cross-Cutting Layer (`common/`)

| Concern | Implementation |
|---|---|
| Auth enforcement | `JwtAuthGuard` registered globally via `APP_GUARD` |
| Role enforcement | `RolesGuard` registered globally via `APP_GUARD` |
| Public routes | `@Public()` decorator sets `isPublic: true` metadata; guard checks this |
| Error shape | `HttpExceptionFilter` applied globally |
| Password stripping | `ClassSerializerInterceptor` applied globally; `@Exclude()` on `password` field |
| Input validation | `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true` |
| Pagination | Shared `PaginationDto` + `PaginatedResponse` interface reused across all list endpoints |

---

## 2. Data Models

All entities use UUID primary keys. `synchronize: true` in development — TypeORM creates/updates tables automatically.

### `admin_users`
```typescript
id          uuid PK
name        string
email       string (unique)
password    string (bcrypt hash) — @Exclude(), never returned
role        enum('super_admin', 'staff')  default: 'staff'
avatar      string | null
createdAt   timestamp
updatedAt   timestamp
```

### `blog_posts`
```typescript
id              uuid PK
title           string (max 200)
slug            string (unique) — regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
content         TEXT — Tiptap JSON string, stored/returned as-is, never parsed
status          enum('draft', 'published', 'scheduled')
category        string — must be one of: 'Company News' | 'Solutions' | 'Insights' | 'Case Studies'
tags            simple-array | null
featuredImage   string | null
metaTitle       string (max 60)
metaDescription string (max 160)
ogImage         string | null
scheduledAt     timestamptz | null
author          ManyToOne → admin_users
createdAt       timestamp
updatedAt       timestamp
```

**SEO mapping:** flat DB columns (`metaTitle`, `metaDescription`, `ogImage`) are mapped to a nested `seo: {}` object in the service layer before returning. No separate SEO table.

### `activity_events`
```typescript
id       uuid PK
type     enum('publish', 'draft', 'login', 'delete', 'edit')
message  string
user     ManyToOne → admin_users
createdAt timestamp
```

### `notifications`
```typescript
id        uuid PK
title     string
message   string
type      enum('info', 'success', 'warning', 'error')
read      boolean  default: false
user      ManyToOne → admin_users
createdAt timestamp
```

### `password_reset_tokens`
```typescript
id        uuid PK
token     string (unique) — plain UUID, single-use, 1hr TTL
user      ManyToOne → admin_users
expiresAt timestamptz
used      boolean  default: false
createdAt timestamp
```

---

## 3. API Endpoints

**Base URL:** `http://localhost:3000/api/v1`  
**Swagger UI:** `http://localhost:3000/api/docs`  
JWT required on all routes unless marked `@Public()`.

### Auth
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/login` | Public | Returns `{ access_token, user }` |
| POST | `/auth/forgot-password` | Public | Logs reset token to console (TODO: email) |
| POST | `/auth/reset-password` | Public | Verifies token, checks TTL and used flag, updates password |
| GET | `/auth/me` | JWT | Returns current user from token |

### Blog
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/blog` | JWT | Paginated, all statuses |
| GET | `/blog/public` | Public | Paginated, published only |
| GET | `/blog/:id` | JWT | Single post with nested `seo` object |
| POST | `/blog` | JWT | Creates post, logs activity |
| PUT | `/blog/:id` | JWT | staff: own posts only; super_admin: any |
| DELETE | `/blog/:id` | super_admin | Logs activity |

**Activity triggers:**
- Created as draft → `{ type: 'draft', message: 'Post saved as draft: <title>' }`
- Published → `{ type: 'publish', message: 'Post published: <title>' }`
- Updated → `{ type: 'edit', message: 'Post updated: <title>' }`
- Deleted → `{ type: 'delete', message: 'Post deleted: <title>' }`

**Slug conflict on PUT:** uniqueness check excludes the current post's own slug.

### Dashboard
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/dashboard/stats` | JWT | `{ totalPosts, publishedPosts, draftPosts, totalUsers }` |
| GET | `/dashboard/activity` | JWT | 20 most recent events, sorted DESC |
| GET | `/dashboard/chart` | JWT | `?days=30` (default 30, max 90); always returns exactly `days` entries, gaps filled with 0 |

**Chart query:** uses PostgreSQL `generate_series` + LEFT JOIN to guarantee no missing dates.

### Notifications
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/notifications` | JWT | Paginated, scoped to req.user |
| PATCH | `/notifications/read-all` | JWT | Registered FIRST to avoid `:id` param collision |
| PATCH | `/notifications/:id/read` | JWT | Marks one as read |

### Profile
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/profile` | JWT | Returns current user |
| PUT | `/profile` | JWT | Updates name / email / avatar |
| PUT | `/profile/password` | JWT | Verifies `currentPassword` with bcrypt before updating |

### Upload
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/upload?type=avatar\|blog-image\|og-image` | JWT | `multipart/form-data`, field: `file` |

**Response:** `{ url: "/uploads/blog-images/uuid.ext" }`  
**Constraints:** JPEG/PNG/WebP only, max 5 MB  
**Disk layout:**
```
uploads/
  avatars/
  blog-images/
  og-images/
```
Filenames are `uuid + original extension` to prevent collisions and path traversal.  
`ServeStaticModule` serves `./uploads` at `/uploads/*` — Nginx-ready (same URL path stays when Nginx takes over later).

---

## 4. Cross-Cutting Concerns

### Swagger
- Package: `@nestjs/swagger` + `swagger-ui-express`
- Mounted at `/api/docs` (bypasses the `api/v1` global prefix)
- Bearer auth configured — paste JWT token to test protected routes in UI
- All DTOs use `@ApiProperty()`, all controllers use `@ApiTags()` + `@ApiOperation()`

### Auth Flow
1. `POST /auth/login` → `bcrypt.compare` → sign JWT `{ sub, email, role }` → return token + user
2. All subsequent requests: `JwtAuthGuard` validates Bearer token, attaches decoded payload to `req.user`
3. `@Public()` sets `isPublic: true` metadata; `JwtAuthGuard` checks this before verifying token
4. `RolesGuard` reads `@Roles('super_admin')` metadata; skips if no roles decorator

### Password Reset
1. `POST /auth/forgot-password` → generate `crypto.randomUUID()` token, save to `password_reset_tokens` with `expiresAt = now + 1h`
2. Log token to console: `console.log('[DEV] Reset token:', token)` with `// TODO: send email` comment
3. `POST /auth/reset-password` → find token, check `!used && expiresAt > now`, bcrypt new password, mark `used: true`

### Error Shape
All errors return:
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [{ "field": "email", "message": "must be a valid email" }]
}
```
Implemented in `HttpExceptionFilter`. The `errors` array is populated from `ValidationPipe` exception details when available.

### Pagination
All list endpoints accept `?page=1&limit=10` and return:
```json
{ "data": [...], "total": 42, "page": 1, "limit": 10, "totalPages": 5 }
```
`PaginationDto`: `page` min 1, `limit` min 1 max 100, both optional with defaults.

### Activity Logging
`DashboardService.logActivity(type, message, user)` is called from `BlogService` and `AuthService` after each relevant action. Synchronous `await` in the same request — no queue needed for v1.

Login activity trigger: `{ type: 'login', message: 'Admin logged in: <name>' }`

---

## 5. Global Setup (`main.ts`)

```typescript
app.setGlobalPrefix('api/v1');
app.enableCors({ origin: [process.env.FRONTEND_ORIGIN, 'https://mymquid.com'], credentials: true });
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
app.useGlobalFilters(new HttpExceptionFilter());
app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
// Swagger mounted separately at /api/docs (no global prefix)
```

---

## 6. Database Seed (`src/database/seed.ts`)

Run with: `npx ts-node src/database/seed.ts`

Creates:
1. One `super_admin` user: `{ name: 'Patrick Evra', email: 'admin@mymquid.com', password: bcrypt('Admin1234!') }`
2. 3–5 `BlogPost` records mixing draft / published / scheduled statuses
3. 3 `Notification` records

---

## 7. Environment Variables

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=mymquid_db

JWT_SECRET=your_super_secret_key_min_32_chars
JWT_EXPIRES_IN=7d

PORT=3000
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:5173
```

`.env.example` ships with the same keys, blank values.

---

## 8. Required Packages

```bash
npm install @nestjs/typeorm typeorm pg
npm install @nestjs/passport @nestjs/jwt passport passport-jwt
npm install @nestjs/config
npm install @nestjs/serve-static
npm install @nestjs/platform-express multer
npm install @nestjs/swagger swagger-ui-express
npm install class-validator class-transformer
npm install bcrypt
npm install @types/bcrypt @types/passport-jwt @types/multer --save-dev
```

---

## 9. Implementation Order

1. Scaffold NestJS project (`nest new mymquid-backend --directory .`)
2. Install all packages
3. Create `.env` and `.env.example`
4. `ConfigModule` (global) + `TypeOrmModule` with all entities registered
5. `ServeStaticModule` — serve `./uploads` at `/uploads`
6. All entities: User, BlogPost, ActivityEvent, Notification, PasswordResetToken
7. `common/` layer: guards, decorators, filter, interceptor, pipe, pagination DTO
8. `UsersModule` — service only, no controller
9. `AuthModule` — login, forgot-password, reset-password, /auth/me
10. `BlogModule` — full CRUD, RBAC, slug validation, activity logging, SEO mapping
11. `DashboardModule` — stats, activity, chart (generate_series query)
12. `NotificationsModule` — read-all route registered before /:id/read
13. `ProfileModule` — get, update, change-password
14. `UploadModule` — multer disk storage, type routing, MIME + size validation
15. `main.ts` — global prefix, CORS, pipes, filters, interceptors, Swagger
16. Database seed script
17. `README.md`
