# MyMquid Elevate — NestJS Backend

REST API backend for the MyMquid Elevate admin platform. Built with NestJS, TypeScript, PostgreSQL, and TypeORM.

## Prerequisites

- **Node.js** 20+ ([download](https://nodejs.org/))
- **PostgreSQL** 15+ ([download](https://www.postgresql.org/))
- **TablePlus** or similar PostgreSQL client for local database management ([download](https://tableplus.com/))
- **npm** 10+ (included with Node.js)

## Quick Start

### 1. Clone & Install

```bash
# Clone the repository
git clone <repo-url>
cd mymquid-backend

# Install dependencies
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and fill in your local values:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
# PostgreSQL Database
DB_HOST=localhost          # Your PostgreSQL server address
DB_PORT=5432              # Default PostgreSQL port
DB_USERNAME=postgres       # Your PostgreSQL username
DB_PASSWORD=your_password  # Your PostgreSQL password
DB_NAME=mymquid_db         # Database name (create this in TablePlus)

# JWT Authentication
JWT_SECRET=your_super_secret_key_min_32_chars  # Generate a strong random string
JWT_EXPIRES_IN=7d                               # Token expiry (7 days)

# Application
PORT=3000                           # Port the API runs on
NODE_ENV=development                # development | production
FRONTEND_ORIGIN=http://localhost:5173  # React frontend URL

# File Uploads (optional if upload feature is implemented)
UPLOAD_DIR=./uploads                # Directory to store uploaded files
```

**Each variable explained:**
- `DB_*` — PostgreSQL connection details
- `JWT_SECRET` — Used to sign and verify JWTs; keep this secret in production
- `JWT_EXPIRES_IN` — How long tokens remain valid (7d = 7 days)
- `PORT` — The port where the API server listens
- `NODE_ENV` — Controls synchronize mode (auto-migrate only in development)
- `FRONTEND_ORIGIN` — Allowed CORS origin (must match React dev server or production URL)
- `UPLOAD_DIR` — Where to store user-uploaded files (avatar, blog images, etc.)

### 3. Database Setup

#### Create the Database in TablePlus

1. Open **TablePlus**
2. Click **+ New** → **PostgreSQL**
3. Enter:
   - **Host**: `localhost`
   - **Port**: `5432`
   - **User**: `postgres`
   - **Password**: Your PostgreSQL password
   - **Database**: (leave blank for now)
4. Click **Connect**
5. In the SQL editor, run:
   ```sql
   CREATE DATABASE mymquid_db;
   ```
6. Create a new connection to `mymquid_db` for development work

**Note:** TypeORM will auto-create all tables on the first app startup (`npm run start:dev`) because `synchronize: true` is enabled in development mode.

### 4. Run the Application

```bash
# Start in development mode (watch for file changes)
npm run start:dev
```

The API will be available at: **`http://localhost:3000/api/v1`**

### 5. Seed the Database (First Time Only)

Once the app has started and tables are created, open a new terminal and run:

```bash
npm run seed
```

This creates:
- One super-admin user: `admin@mymquid.com` / `Admin1234!`
- 3–5 sample blog posts (mix of draft, published, scheduled)
- 3 sample notifications

---

## Default Credentials

```
Email:    admin@mymquid.com
Password: Admin1234!
Role:     super_admin
```

Use these to log in via `POST /api/v1/auth/login`.

---

## API Overview

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication
All endpoints except `/auth/login` and `/auth/forgot-password` require a valid JWT token:
```
Authorization: Bearer <token>
```

### Core Endpoints

| Module | Method | Endpoint | Description |
|--------|--------|----------|-------------|
| **Auth** | POST | `/auth/login` | Login with email & password |
| | POST | `/auth/forgot-password` | Request password reset (token logged to console) |
| | POST | `/auth/reset-password` | Reset password with valid token |
| | GET | `/auth/me` | Get current user profile |
| **Blog** | GET | `/blog` | List all blog posts (paginated) |
| | GET | `/blog/public` | Public posts only (no auth required) |
| | GET | `/blog/:id` | Get single post by ID |
| | POST | `/blog` | Create new post (super_admin or staff) |
| | PUT | `/blog/:id` | Update post (staff can only update own posts) |
| | DELETE | `/blog/:id` | Delete post (super_admin only) |
| **Dashboard** | GET | `/dashboard/stats` | Admin stats (posts, users, etc.) |
| | GET | `/dashboard/activity` | 20 most recent activity events |
| | GET | `/dashboard/chart?days=30` | Posts published per day (max 90 days) |
| **Notifications** | GET | `/notifications` | List notifications for current user |
| | PATCH | `/notifications/:id/read` | Mark one notification as read |
| | PATCH | `/notifications/read-all` | Mark all notifications as read |
| **Profile** | GET | `/profile` | Get current user's profile |
| | PUT | `/profile` | Update name & email |
| | PUT | `/profile/password` | Change password |
| **Upload** | POST | `/upload?type=avatar\|blog-image\|og-image` | Upload file (returns `/uploads/...` URL) |

---

## Key Features

### Authentication
- JWT-based authentication with 7-day expiry
- Role-based access control (RBAC): `super_admin` and `staff` roles
- Password reset tokens (expire in 1 hour, logged to console in development)
- Protected routes via `@JwtAuthGuard()` and `@Roles('super_admin')`

### Blog Management
- CRUD operations for blog posts
- Draft, published, and scheduled statuses
- SEO metadata (meta title, description, OG image)
- Support for Tiptap JSON content
- Staff users can only edit their own posts; super admins can edit any post
- Activity logging (publish, draft, edit, delete events)

### Activity Dashboard
- Real-time admin activity tracking
- Chart showing posts published per day (configurable period: 1–90 days)
- Recent activity feed with relative timestamps ("2h ago", "3d ago")
- Tracks logins, posts published, edits, and deletions

### Notifications
- In-app notification system for admins
- Mark notifications as read (individually or all at once)
- Notification types: `info`, `success`, `warning`, `error`

### Profile Management
- Update user name and email
- Change password with current password verification
- Account operations isolated to the authenticated user

### File Uploads
- Avatar uploads for user profiles
- Featured images and OG images for blog posts
- Files stored in `/uploads` directory with organized subdirectories
- Returns public URLs for frontend use

---

## Development Notes

### TypeORM Synchronization
- **Development** (`NODE_ENV=development`): `synchronize: true` — automatically create/update tables
- **Production** (`NODE_ENV=production`): `synchronize: false` — use database migrations instead
- Never enable `synchronize: true` in production (data loss risk)

### Password Reset Flow (Development)
Since there's no email service yet:
1. `POST /auth/forgot-password` → token is **logged to console**
2. Copy the token from the console output
3. Use it in `POST /auth/reset-password`

In production, integrate a mail service (SendGrid, AWS SES, etc.) and send the token via email.

### Database Queries & Debugging
- Use TablePlus to inspect tables and run raw SQL
- TypeORM logs all queries to stdout (via `logging: true` in `database.config.ts`)
- Check console output for JWT token generation and password reset tokens

### CORS & Frontend
- The API allows requests from `FRONTEND_ORIGIN` (default: `http://localhost:5173`)
- Also allows requests from production domain (`https://mymquid.com`)
- Credentials are enabled; ensure frontend sends `credentials: 'include'` in fetch/axios requests

---

## Project Structure

```
src/
├── main.ts                          # App entry point
├── app.module.ts                    # Root module
├── common/                          # Shared utilities
│   ├── decorators/                  # @CurrentUser, @Roles, @Public
│   ├── guards/                      # JwtAuthGuard, RolesGuard
│   ├── filters/                     # HttpExceptionFilter (error formatting)
│   ├── interceptors/                # ClassSerializerInterceptor (for @Exclude)
│   ├── pipes/                       # ValidationPipe
│   ├── dto/                         # PaginationDto
│   └── interfaces/                  # PaginatedResponseInterface
├── config/                          # Database & JWT config
├── auth/                            # Authentication module
│   ├── auth.service.ts              # Login, JWT generation, password reset
│   ├── auth.controller.ts           # /auth routes
│   ├── strategies/                  # JWT strategy for Passport
│   └── entities/                    # PasswordResetToken entity
├── users/                           # User management (service-only)
│   ├── users.service.ts             # User CRUD operations
│   └── entities/                    # User entity
├── blog/                            # Blog post management
│   ├── blog.controller.ts           # /blog routes
│   ├── blog.service.ts              # Blog business logic
│   ├── dto/                         # CreateBlogPostDto, UpdateBlogPostDto
│   └── entities/                    # BlogPost entity
├── dashboard/                       # Admin dashboard
│   ├── dashboard.controller.ts      # /dashboard routes
│   ├── dashboard.service.ts         # Stats, charts, activity logging
│   └── entities/                    # ActivityEvent entity
├── notifications/                   # Notification system
│   ├── notifications.controller.ts  # /notifications routes
│   ├── notifications.service.ts     # Notification CRUD
│   └── entities/                    # Notification entity
├── profile/                         # User profile management
│   ├── profile.controller.ts        # /profile routes
│   ├── profile.service.ts           # Profile updates, password change
│   └── dto/                         # UpdateProfileDto, ChangePasswordDto
└── upload/                          # File upload handling (optional)
    ├── upload.controller.ts
    ├── upload.service.ts
    └── dto/                         # UploadDto
```

---

## Available Commands

```bash
# Development
npm run start:dev          # Run in watch mode

# Production
npm run build              # Compile TypeScript to JavaScript
npm run start              # Run compiled code

# Database
npm run seed               # Populate database with sample data

# Testing (if configured)
npm run test               # Run unit tests
npm run test:cov           # Generate coverage report
npm run test:e2e           # Run end-to-end tests
```

---

## Troubleshooting

### "FATAL: database does not exist"
Create the database in TablePlus: `CREATE DATABASE mymquid_db;`

### "password authentication failed"
Check your `DB_USERNAME` and `DB_PASSWORD` in `.env`. Default PostgreSQL user is `postgres`.

### "Port 3000 already in use"
Change `PORT` in `.env` or kill the process: `lsof -ti:3000 | xargs kill -9` (macOS/Linux) or use Task Manager (Windows).

### "Cannot find module 'crypto/randomUUID'"
Ensure Node.js 20+ is installed: `node --version`

### JWT token is invalid or expired
- Check `JWT_SECRET` matches between requests
- Tokens expire after 7 days by default; log in again to get a fresh token
- Dev: Use `JWT_EXPIRES_IN=30d` for longer-lived tokens during development

### TypeORM table creation fails
Ensure PostgreSQL is running and `NODE_ENV=development`. Check `synchronize: true` in `src/config/database.config.ts`.

---

## Contact & Support

For questions, issues, or feature requests, contact the development team or open an issue on the repository.

---

## License

This project is proprietary software for MyMquid Elevate.
