# MyMquid Elevate Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete NestJS REST API backend for the MyMquid Elevate admin platform, including auth, blog CRUD, dashboard analytics, notifications, profile management, and file uploads.

**Architecture:** NestJS monolith with feature modules; TypeORM for PostgreSQL with `synchronize: true`; JWT auth via Passport; all cross-cutting concerns (guards, filters, interceptors, pipes) in a shared `common/` layer. Modules communicate only through injected services — never by reaching into each other's repositories. `DashboardModule` and `UsersModule` export their services so `AuthModule`, `BlogModule`, and `ProfileModule` can consume them.

**Tech Stack:** NestJS 10, TypeScript, TypeORM, PostgreSQL, `passport-jwt`, `bcrypt`, `multer`, `@nestjs/swagger`, `@nestjs/serve-static`, `class-validator`, `class-transformer`

---

## File Map

```
src/
├── main.ts                                         # bootstrap, Swagger, global prefix
├── app.module.ts                                   # root module wiring all feature modules
├── app.controller.ts                               # GET /health only
├── app.service.ts                                  # returns uptime string
│
├── common/
│   ├── decorators/
│   │   ├── public.decorator.ts                     # @Public() — opts route out of JWT guard
│   │   ├── current-user.decorator.ts               # @CurrentUser() — extracts req.user
│   │   └── roles.decorator.ts                      # @Roles('super_admin') — sets metadata
│   ├── guards/
│   │   ├── jwt-auth.guard.ts                       # global JWT guard, respects @Public()
│   │   └── roles.guard.ts                          # global roles guard, reads @Roles()
│   ├── filters/
│   │   └── http-exception.filter.ts                # consistent error shape
│   ├── interceptors/
│   │   └── transform.interceptor.ts                # wraps success responses (unused default, ClassSerializerInterceptor used instead)
│   ├── dto/
│   │   └── pagination.dto.ts                       # page + limit query params
│   └── interfaces/
│       └── paginated-response.interface.ts          # { data, total, page, limit, totalPages }
│
├── config/
│   ├── database.config.ts                          # TypeORM config factory
│   └── jwt.config.ts                               # JWT config factory
│
├── users/
│   ├── users.module.ts                             # exports UsersService
│   ├── users.service.ts                            # findByEmail, findById, create, update
│   └── entities/
│       └── user.entity.ts                          # admin_users table
│
├── auth/
│   ├── auth.module.ts                              # imports UsersModule + DashboardModule
│   ├── auth.controller.ts                          # login, forgot-password, reset-password, /me
│   ├── auth.service.ts                             # login, forgotPassword, resetPassword
│   ├── strategies/
│   │   └── jwt.strategy.ts                         # validates Bearer token, returns req.user
│   ├── dto/
│   │   ├── login.dto.ts
│   │   ├── forgot-password.dto.ts
│   │   └── reset-password.dto.ts
│   └── entities/
│       └── password-reset-token.entity.ts
│
├── blog/
│   ├── blog.module.ts                              # imports UsersModule + DashboardModule
│   ├── blog.controller.ts
│   ├── blog.service.ts                             # CRUD, RBAC, SEO mapping, slug validation
│   ├── constants/
│   │   └── blog-categories.ts                      # BLOG_CATEGORIES array
│   ├── dto/
│   │   ├── create-blog-post.dto.ts
│   │   └── update-blog-post.dto.ts
│   └── entities/
│       └── blog-post.entity.ts
│
├── dashboard/
│   ├── dashboard.module.ts                         # exports DashboardService
│   ├── dashboard.controller.ts
│   ├── dashboard.service.ts                        # stats, activity, chart, logActivity
│   └── entities/
│       └── activity-event.entity.ts
│
├── notifications/
│   ├── notifications.module.ts
│   ├── notifications.controller.ts                 # read-all registered before /:id/read
│   ├── notifications.service.ts
│   └── entities/
│       └── notification.entity.ts
│
├── profile/
│   ├── profile.module.ts                           # imports UsersModule
│   ├── profile.controller.ts
│   ├── profile.service.ts
│   └── dto/
│       ├── update-profile.dto.ts
│       └── change-password.dto.ts
│
├── upload/
│   ├── upload.module.ts
│   ├── upload.controller.ts
│   └── upload.service.ts                           # multer disk storage, type routing
│
└── database/
    └── seed.ts                                     # creates super_admin + sample data
```

---

## Task 1: Scaffold Project & Install Dependencies

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json` (via `nest new`)
- Create: `.env`
- Create: `.env.example`

- [ ] **Step 1.1: Install NestJS CLI globally**

```bash
npm install -g @nestjs/cli
```

Expected: `nest` command available globally.

- [ ] **Step 1.2: Scaffold the project in the current directory**

Run from `c:\Mquid_backend`:

```bash
nest new . --package-manager npm --skip-git
```

When prompted about existing files, confirm overwrite. This creates `src/`, `test/`, `package.json`, `tsconfig.json`, `nest-cli.json`.

- [ ] **Step 1.3: Install feature dependencies**

```bash
npm install @nestjs/typeorm typeorm pg
npm install @nestjs/passport @nestjs/jwt passport passport-jwt
npm install @nestjs/config
npm install @nestjs/serve-static
npm install @nestjs/platform-express multer
npm install @nestjs/swagger swagger-ui-express
npm install class-validator class-transformer
npm install bcrypt
```

- [ ] **Step 1.4: Install dev dependencies**

```bash
npm install --save-dev @types/bcrypt @types/passport-jwt @types/multer
```

- [ ] **Step 1.5: Create `.env`**

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=mymquid_db

JWT_SECRET=your_super_secret_key_min_32_chars_long
JWT_EXPIRES_IN=7d

PORT=3000
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:5173
```

- [ ] **Step 1.6: Create `.env.example`**

```env
DB_HOST=
DB_PORT=
DB_USERNAME=
DB_PASSWORD=
DB_NAME=

JWT_SECRET=
JWT_EXPIRES_IN=

PORT=
NODE_ENV=
FRONTEND_ORIGIN=
```

- [ ] **Step 1.7: Verify scaffold compiles**

```bash
npm run build
```

Expected: `dist/` folder created, no errors.

- [ ] **Step 1.8: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold NestJS project with dependencies"
```

---

## Task 2: Config & Database Setup

**Files:**
- Create: `src/config/database.config.ts`
- Create: `src/config/jwt.config.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 2.1: Create `src/config/database.config.ts`**

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  name: process.env.DB_NAME,
}));
```

- [ ] **Step 2.2: Create `src/config/jwt.config.ts`**

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN,
}));
```

- [ ] **Step 2.3: Update `src/app.module.ts` with ConfigModule and TypeOrmModule**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.name'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 2.4: Write test for database config factory**

Create `src/config/database.config.spec.ts`:

```typescript
describe('databaseConfig', () => {
  it('reads env vars into database config shape', () => {
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USERNAME = 'postgres';
    process.env.DB_PASSWORD = 'pass';
    process.env.DB_NAME = 'testdb';

    // registerAs returns a factory; call it
    const factory = require('./database.config').default;
    const config = factory();
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(5432);
    expect(config.name).toBe('testdb');
  });
});
```

- [ ] **Step 2.5: Run test**

```bash
npx jest database.config.spec --no-coverage
```

Expected: PASS

- [ ] **Step 2.6: Commit**

```bash
git add src/config/ src/app.module.ts
git commit -m "feat: add ConfigModule and TypeORM database setup"
```

---

## Task 3: All Entities

**Files:**
- Create: `src/users/entities/user.entity.ts`
- Create: `src/blog/entities/blog-post.entity.ts`
- Create: `src/dashboard/entities/activity-event.entity.ts`
- Create: `src/notifications/entities/notification.entity.ts`
- Create: `src/auth/entities/password-reset-token.entity.ts`

- [ ] **Step 3.1: Create `src/users/entities/user.entity.ts`**

```typescript
import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('admin_users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  @Exclude()
  password: string;

  @Column({ type: 'enum', enum: ['super_admin', 'staff'], default: 'staff' })
  role: 'super_admin' | 'staff';

  @Column({ nullable: true })
  avatar: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  toJSON() {
    const { password: _pw, ...rest } = this as any;
    return rest;
  }
}
```

- [ ] **Step 3.2: Create `src/blog/entities/blog-post.entity.ts`**

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('blog_posts')
export class BlogPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  title: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: ['draft', 'published', 'scheduled'] })
  status: 'draft' | 'published' | 'scheduled';

  @Column()
  category: string;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @Column({ nullable: true })
  featuredImage: string;

  @Column({ length: 60 })
  metaTitle: string;

  @Column({ length: 160 })
  metaDescription: string;

  @Column({ nullable: true })
  ogImage: string;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date;

  @ManyToOne(() => User, { eager: true })
  author: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 3.3: Create `src/dashboard/entities/activity-event.entity.ts`**

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('activity_events')
export class ActivityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ['publish', 'draft', 'login', 'delete', 'edit'] })
  type: 'publish' | 'draft' | 'login' | 'delete' | 'edit';

  @Column()
  message: string;

  @ManyToOne(() => User, { eager: true })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 3.4: Create `src/notifications/entities/notification.entity.ts`**

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  message: string;

  @Column({ type: 'enum', enum: ['info', 'success', 'warning', 'error'] })
  type: 'info' | 'success' | 'warning' | 'error';

  @Column({ default: false })
  read: boolean;

  @ManyToOne(() => User, { eager: false })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 3.5: Create `src/auth/entities/password-reset-token.entity.ts`**

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @ManyToOne(() => User)
  user: User;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 3.6: Commit**

```bash
git add src/users/entities/ src/blog/entities/ src/dashboard/entities/ src/notifications/entities/ src/auth/entities/
git commit -m "feat: add all TypeORM entities"
```

---

## Task 4: Common Layer

**Files:**
- Create: `src/common/decorators/public.decorator.ts`
- Create: `src/common/decorators/current-user.decorator.ts`
- Create: `src/common/decorators/roles.decorator.ts`
- Create: `src/common/guards/jwt-auth.guard.ts`
- Create: `src/common/guards/roles.guard.ts`
- Create: `src/common/filters/http-exception.filter.ts`
- Create: `src/common/dto/pagination.dto.ts`
- Create: `src/common/interfaces/paginated-response.interface.ts`

- [ ] **Step 4.1: Create `src/common/decorators/public.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 4.2: Create `src/common/decorators/current-user.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

- [ ] **Step 4.3: Create `src/common/decorators/roles.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 4.4: Create `src/common/guards/jwt-auth.guard.ts`**

```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

- [ ] **Step 4.5: Create `src/common/guards/roles.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
```

- [ ] **Step 4.6: Create `src/common/filters/http-exception.filter.ts`**

```typescript
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse() as any;

    const isValidationError =
      typeof body === 'object' && Array.isArray(body.message);

    response.status(status).json({
      statusCode: status,
      message: isValidationError ? 'Validation failed' : (body.message ?? body),
      errors: isValidationError
        ? body.message.map((msg: string) => ({
            field: msg.split(' ')[0],
            message: msg,
          }))
        : [],
    });
  }
}
```

- [ ] **Step 4.7: Create `src/common/dto/pagination.dto.ts`**

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
```

- [ ] **Step 4.8: Create `src/common/interfaces/paginated-response.interface.ts`**

```typescript
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

- [ ] **Step 4.9: Write unit tests for HttpExceptionFilter**

Create `src/common/filters/http-exception.filter.spec.ts`:

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function makeHost(statusFn: jest.Mock, jsonFn: jest.Mock) {
  return {
    switchToHttp: () => ({
      getResponse: () => ({ status: statusFn, json: jsonFn }),
    }),
  } as any;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let json: jest.Mock;
  let status: jest.Mock;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
  });

  it('returns standard error shape for plain HttpException', () => {
    const ex = new HttpException('Not found', HttpStatus.NOT_FOUND);
    filter.catch(ex, makeHost(status, json));
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ statusCode: 404, message: 'Not found', errors: [] });
  });

  it('formats validation errors into field/message pairs', () => {
    const ex = new HttpException(
      { message: ['email must be an email', 'password must be longer than 6'], error: 'Bad Request' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(ex, makeHost(status, json));
    const call = json.mock.calls[0][0];
    expect(call.message).toBe('Validation failed');
    expect(call.errors).toHaveLength(2);
    expect(call.errors[0].field).toBe('email');
  });
});
```

- [ ] **Step 4.10: Run tests**

```bash
npx jest http-exception.filter.spec --no-coverage
```

Expected: PASS

- [ ] **Step 4.11: Commit**

```bash
git add src/common/
git commit -m "feat: add common layer — guards, decorators, filter, pagination"
```

---

## Task 5: UsersModule

**Files:**
- Create: `src/users/users.service.ts`
- Create: `src/users/users.module.ts`
- Create: `src/users/users.service.spec.ts`

- [ ] **Step 5.1: Write failing tests for UsersService**

Create `src/users/users.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

const mockUser: Partial<User> = {
  id: 'uuid-1',
  email: 'a@b.com',
  name: 'Test',
  role: 'staff',
};

const mockRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  it('findByEmail returns user when found', async () => {
    mockRepo.findOne.mockResolvedValue(mockUser);
    const result = await service.findByEmail('a@b.com');
    expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
    expect(result).toEqual(mockUser);
  });

  it('findByEmail returns null when not found', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    const result = await service.findByEmail('x@x.com');
    expect(result).toBeNull();
  });

  it('findById returns user by id', async () => {
    mockRepo.findOne.mockResolvedValue(mockUser);
    const result = await service.findById('uuid-1');
    expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
    expect(result).toEqual(mockUser);
  });

  it('create saves and returns new user', async () => {
    mockRepo.create.mockReturnValue(mockUser);
    mockRepo.save.mockResolvedValue(mockUser);
    const result = await service.create({ name: 'Test', email: 'a@b.com', password: 'hash', role: 'staff' });
    expect(mockRepo.create).toHaveBeenCalled();
    expect(mockRepo.save).toHaveBeenCalled();
    expect(result).toEqual(mockUser);
  });

  it('update saves changes and returns updated user', async () => {
    const updated = { ...mockUser, name: 'New' };
    mockRepo.findOne.mockResolvedValue(updated);
    mockRepo.save.mockResolvedValue(updated);
    const result = await service.update('uuid-1', { name: 'New' } as any);
    expect(result.name).toBe('New');
  });
});
```

- [ ] **Step 5.2: Run tests to see them fail**

```bash
npx jest users.service.spec --no-coverage
```

Expected: FAIL — `Cannot find module './users.service'`

- [ ] **Step 5.3: Create `src/users/users.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  create(data: Partial<User>): Promise<User> {
    const user = this.userRepo.create(data);
    return this.userRepo.save(user);
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    await this.userRepo.save({ id, ...data });
    return this.findById(id);
  }
}
```

- [ ] **Step 5.4: Create `src/users/users.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 5.5: Run tests**

```bash
npx jest users.service.spec --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5.6: Commit**

```bash
git add src/users/
git commit -m "feat: add UsersModule with service"
```

---

## Task 6: AuthModule — JWT Strategy & Login

**Files:**
- Create: `src/auth/strategies/jwt.strategy.ts`
- Create: `src/auth/dto/login.dto.ts`
- Create: `src/auth/auth.service.ts`
- Create: `src/auth/auth.controller.ts`
- Create: `src/auth/auth.module.ts`
- Create: `src/auth/auth.service.spec.ts`

- [ ] **Step 6.1: Create `src/auth/strategies/jwt.strategy.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret'),
    });
  }

  validate(payload: { sub: string; email: string; role: string }) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
```

- [ ] **Step 6.2: Create `src/auth/dto/login.dto.ts`**

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@mymquid.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin1234!' })
  @IsString()
  @MinLength(6)
  password: string;
}
```

- [ ] **Step 6.3: Write failing tests for AuthService login**

Create `src/auth/auth.service.spec.ts`:

```typescript
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { UsersService } from '../users/users.service';
import { DashboardService } from '../dashboard/dashboard.service';

const mockUser = {
  id: 'uuid-1',
  email: 'admin@mymquid.com',
  password: '$2b$10$hashedpassword',
  name: 'Patrick Evra',
  role: 'super_admin',
};

describe('AuthService - login', () => {
  let service: AuthService;
  const usersService = { findByEmail: jest.fn() };
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
    usersService.findByEmail.mockResolvedValue(null);
    await expect(service.login({ email: 'x@x.com', password: 'pass' })).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when password does not match', async () => {
    usersService.findByEmail.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
    await expect(service.login({ email: mockUser.email, password: 'wrong' })).rejects.toThrow(UnauthorizedException);
  });

  it('returns access_token and user on successful login', async () => {
    usersService.findByEmail.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    const result = await service.login({ email: mockUser.email, password: 'Admin1234!' });
    expect(result.access_token).toBe('jwt-token');
    expect(result.user.email).toBe(mockUser.email);
    expect(dashboardService.logActivity).toHaveBeenCalledWith('login', expect.stringContaining('Patrick Evra'), mockUser);
  });
});
```

- [ ] **Step 6.4: Run tests to see them fail**

```bash
npx jest auth.service.spec --no-coverage
```

Expected: FAIL — `Cannot find module './auth.service'`

- [ ] **Step 6.5: Create `src/auth/auth.service.ts`**

```typescript
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
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
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
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = this.jwtService.sign(payload);

    await this.dashboardService.logActivity('login', `Admin logged in: ${user.name}`, user);

    return { access_token, user };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) return; // silently ignore — don't leak whether email exists

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const resetToken = this.tokenRepo.create({ token, user, expiresAt });
    await this.tokenRepo.save(resetToken);

    // TODO: send email
    console.log('[DEV] Password reset token:', token);
  }

  async resetPassword(dto: ResetPasswordDto) {
    const record = await this.tokenRepo.findOne({
      where: { token: dto.token },
      relations: ['user'],
    });

    if (!record) throw new NotFoundException('Invalid reset token');
    if (record.used) throw new UnauthorizedException('Token already used');
    if (record.expiresAt < new Date()) throw new UnauthorizedException('Token expired');

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.update(record.user.id, { password: hashed });

    record.used = true;
    await this.tokenRepo.save(record);
  }
}
```

- [ ] **Step 6.6: Run tests**

```bash
npx jest auth.service.spec --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 6.7: Create `src/auth/dto/forgot-password.dto.ts`**

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@mymquid.com' })
  @IsEmail()
  email: string;
}
```

- [ ] **Step 6.8: Create `src/auth/dto/reset-password.dto.ts`**

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
```

- [ ] **Step 6.9: Create `src/auth/auth.controller.ts`**

```typescript
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login and receive a JWT' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request password reset token' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset password using token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(@CurrentUser() user: any) {
    return user;
  }
}
```

- [ ] **Step 6.10: Create `src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardModule } from '../dashboard/dashboard.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn') },
      }),
    }),
    TypeOrmModule.forFeature([PasswordResetToken]),
    UsersModule,
    DashboardModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
```

- [ ] **Step 6.11: Commit**

```bash
git add src/auth/
git commit -m "feat: add AuthModule — JWT strategy, login, forgot/reset password"
```

---

## Task 7: DashboardModule

**Files:**
- Create: `src/dashboard/dashboard.service.ts`
- Create: `src/dashboard/dashboard.controller.ts`
- Create: `src/dashboard/dashboard.module.ts`
- Create: `src/dashboard/dashboard.service.spec.ts`

- [ ] **Step 7.1: Write failing tests for DashboardService**

Create `src/dashboard/dashboard.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { ActivityEvent } from './entities/activity-event.entity';
import { BlogPost } from '../blog/entities/blog-post.entity';
import { User } from '../users/entities/user.entity';

describe('DashboardService - relativeTime', () => {
  let service: DashboardService;

  const activityRepo = { save: jest.fn(), create: jest.fn(), find: jest.fn() };
  const blogRepo = { count: jest.fn(), query: jest.fn() };
  const userRepo = { count: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(ActivityEvent), useValue: activityRepo },
        { provide: getRepositoryToken(BlogPost), useValue: blogRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();
    service = module.get(DashboardService);
  });

  it('returns "just now" for recent events', () => {
    const now = new Date();
    expect(service.relativeTime(now)).toBe('just now');
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

- [ ] **Step 7.2: Run tests to see them fail**

```bash
npx jest dashboard.service.spec --no-coverage
```

Expected: FAIL — `Cannot find module './dashboard.service'`

- [ ] **Step 7.3: Create `src/dashboard/dashboard.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlogPost } from '../blog/entities/blog-post.entity';
import { User } from '../users/entities/user.entity';
import { ActivityEvent } from './entities/activity-event.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ActivityEvent)
    private readonly activityRepo: Repository<ActivityEvent>,
    @InjectRepository(BlogPost)
    private readonly blogPostRepo: Repository<BlogPost>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getStats() {
    const [totalPosts, publishedPosts, draftPosts, totalUsers] = await Promise.all([
      this.blogPostRepo.count(),
      this.blogPostRepo.count({ where: { status: 'published' } }),
      this.blogPostRepo.count({ where: { status: 'draft' } }),
      this.userRepo.count(),
    ]);
    return { totalPosts, publishedPosts, draftPosts, totalUsers };
  }

  async getActivity() {
    const events = await this.activityRepo.find({
      order: { createdAt: 'DESC' },
      take: 20,
      relations: ['user'],
    });
    return events.map((e) => ({ ...e, time: this.relativeTime(e.createdAt) }));
  }

  async getChart(days: number) {
    const result = await this.blogPostRepo.query(`
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
      ORDER BY d ASC
    `);
    return result;
  }

  async logActivity(
    type: 'publish' | 'draft' | 'login' | 'delete' | 'edit',
    message: string,
    user: User,
  ) {
    const event = this.activityRepo.create({ type, message, user });
    await this.activityRepo.save(event);
  }

  relativeTime(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
```

- [ ] **Step 7.4: Run tests**

```bash
npx jest dashboard.service.spec --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 7.5: Create `src/dashboard/dashboard.controller.ts`**

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get aggregate stats' })
  getStats() {
    return this.dashboardService.getStats();
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get 20 most recent activity events' })
  getActivity() {
    return this.dashboardService.getActivity();
  }

  @Get('chart')
  @ApiOperation({ summary: 'Get post counts per day' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  getChart(@Query('days') days = 30) {
    const d = Math.min(Math.max(Number(days) || 30, 1), 90);
    return this.dashboardService.getChart(d);
  }
}
```

- [ ] **Step 7.6: Create `src/dashboard/dashboard.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogPost } from '../blog/entities/blog-post.entity';
import { User } from '../users/entities/user.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ActivityEvent } from './entities/activity-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityEvent, BlogPost, User])],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
```

- [ ] **Step 7.7: Commit**

```bash
git add src/dashboard/
git commit -m "feat: add DashboardModule — stats, activity, chart, logActivity"
```

---

## Task 8: BlogModule

**Files:**
- Create: `src/blog/constants/blog-categories.ts`
- Create: `src/blog/dto/create-blog-post.dto.ts`
- Create: `src/blog/dto/update-blog-post.dto.ts`
- Create: `src/blog/blog.service.ts`
- Create: `src/blog/blog.controller.ts`
- Create: `src/blog/blog.module.ts`
- Create: `src/blog/blog.service.spec.ts`

- [ ] **Step 8.1: Create `src/blog/constants/blog-categories.ts`**

```typescript
export const BLOG_CATEGORIES = [
  'Company News',
  'Solutions',
  'Insights',
  'Case Studies',
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
```

- [ ] **Step 8.2: Create `src/blog/dto/create-blog-post.dto.ts`**

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BLOG_CATEGORIES } from '../constants/blog-categories';

export class CreateBlogPostDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'URL-safe slug: lowercase letters, numbers, hyphens' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @ApiProperty({ description: 'Tiptap JSON string — stored as-is' })
  @IsString()
  content: string;

  @ApiProperty({ enum: ['draft', 'published', 'scheduled'] })
  @IsIn(['draft', 'published', 'scheduled'])
  status: 'draft' | 'published' | 'scheduled';

  @ApiProperty({ enum: BLOG_CATEGORIES })
  @IsIn(BLOG_CATEGORIES)
  category: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  featuredImage?: string;

  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MaxLength(60)
  metaTitle: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  metaDescription: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ogImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  scheduledAt?: Date;
}
```

- [ ] **Step 8.3: Create `src/blog/dto/update-blog-post.dto.ts`**

```typescript
import { PartialType } from '@nestjs/swagger';
import { CreateBlogPostDto } from './create-blog-post.dto';

export class UpdateBlogPostDto extends PartialType(CreateBlogPostDto) {}
```

- [ ] **Step 8.4: Write failing tests for BlogService**

Create `src/blog/blog.service.spec.ts`:

```typescript
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BlogService } from './blog.service';
import { BlogPost } from './entities/blog-post.entity';
import { DashboardService } from '../dashboard/dashboard.service';

const mockAuthor = { id: 'user-1', role: 'staff', name: 'Staff User' };
const mockAdmin = { id: 'admin-1', role: 'super_admin', name: 'Admin' };
const mockPost = {
  id: 'post-1',
  title: 'Test Post',
  slug: 'test-post',
  status: 'draft',
  author: mockAuthor,
  metaTitle: 'SEO Title',
  metaDescription: 'SEO Desc',
  ogImage: null,
};

const blogRepo = {
  findAndCount: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
};
const dashboardService = { logActivity: jest.fn() };

describe('BlogService', () => {
  let service: BlogService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BlogService,
        { provide: getRepositoryToken(BlogPost), useValue: blogRepo },
        { provide: DashboardService, useValue: dashboardService },
      ],
    }).compile();
    service = module.get(BlogService);
    jest.clearAllMocks();
  });

  describe('mapToResponse', () => {
    it('maps flat SEO columns to nested seo object', () => {
      const result = service.mapToResponse(mockPost as any);
      expect(result.seo).toEqual({
        metaTitle: 'SEO Title',
        metaDescription: 'SEO Desc',
        ogImage: null,
      });
      expect(result).not.toHaveProperty('metaTitle');
      expect(result).not.toHaveProperty('metaDescription');
    });
  });

  describe('update', () => {
    it('throws ForbiddenException when staff tries to edit another author post', async () => {
      blogRepo.findOne.mockResolvedValue({ ...mockPost, author: { id: 'other-user' } });
      await expect(
        service.update('post-1', { title: 'New' }, { id: 'user-1', role: 'staff' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows staff to edit their own post', async () => {
      blogRepo.findOne.mockResolvedValue({ ...mockPost, author: { id: 'user-1' } });
      blogRepo.save.mockResolvedValue({ ...mockPost, title: 'Updated' });
      await expect(
        service.update('post-1', { title: 'Updated' }, mockAuthor as any),
      ).resolves.toBeDefined();
    });

    it('allows super_admin to edit any post', async () => {
      blogRepo.findOne.mockResolvedValue({ ...mockPost, author: { id: 'other-user' } });
      blogRepo.save.mockResolvedValue({ ...mockPost, title: 'Updated' });
      await expect(
        service.update('post-1', { title: 'Updated' }, mockAdmin as any),
      ).resolves.toBeDefined();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when post does not exist', async () => {
      blogRepo.findOne.mockResolvedValue(null);
      await expect(service.remove('nonexistent', mockAdmin as any)).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 8.5: Run tests to see them fail**

```bash
npx jest blog.service.spec --no-coverage
```

Expected: FAIL — `Cannot find module './blog.service'`

- [ ] **Step 8.6: Create `src/blog/blog.service.ts`**

```typescript
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { DashboardService } from '../dashboard/dashboard.service';
import { User } from '../users/entities/user.entity';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';
import { BlogPost } from './entities/blog-post.entity';

@Injectable()
export class BlogService {
  constructor(
    @InjectRepository(BlogPost)
    private readonly blogPostRepo: Repository<BlogPost>,
    private readonly dashboardService: DashboardService,
  ) {}

  async findAll(page: number, limit: number) {
    const [data, total] = await this.blogPostRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['author'],
    });
    return {
      data: data.map((p) => this.mapToResponse(p)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findPublic(page: number, limit: number) {
    const [data, total] = await this.blogPostRepo.findAndCount({
      where: { status: 'published' },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['author'],
    });
    return {
      data: data.map((p) => this.mapToResponse(p)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const post = await this.blogPostRepo.findOne({ where: { id }, relations: ['author'] });
    if (!post) throw new NotFoundException('Blog post not found');
    return this.mapToResponse(post);
  }

  async create(dto: CreateBlogPostDto, author: User) {
    const post = this.blogPostRepo.create({ ...dto, author });
    const saved = await this.blogPostRepo.save(post);

    const activityType = saved.status === 'published' ? 'publish' : 'draft';
    const activityMsg =
      saved.status === 'published'
        ? `Post published: ${saved.title}`
        : `Post saved as draft: ${saved.title}`;
    await this.dashboardService.logActivity(activityType, activityMsg, author);

    return this.mapToResponse(saved);
  }

  async update(id: string, dto: UpdateBlogPostDto, user: User) {
    const post = await this.blogPostRepo.findOne({ where: { id }, relations: ['author'] });
    if (!post) throw new NotFoundException('Blog post not found');

    if (user.role === 'staff' && post.author.id !== user.id) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    // Slug uniqueness check excludes current post
    if (dto.slug && dto.slug !== post.slug) {
      const conflict = await this.blogPostRepo.findOne({
        where: { slug: dto.slug, id: Not(id) },
      });
      if (conflict) throw new ForbiddenException('Slug already in use by another post');
    }

    const updated = await this.blogPostRepo.save({ ...post, ...dto });
    await this.dashboardService.logActivity('edit', `Post updated: ${updated.title}`, user);

    return this.mapToResponse(updated);
  }

  async remove(id: string, user: User) {
    const post = await this.blogPostRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');
    await this.blogPostRepo.remove(post);
    await this.dashboardService.logActivity('delete', `Post deleted: ${post.title}`, user);
  }

  mapToResponse(post: BlogPost) {
    const { metaTitle, metaDescription, ogImage, ...rest } = post as any;
    return { ...rest, seo: { metaTitle, metaDescription, ogImage } };
  }
}
```

- [ ] **Step 8.7: Run tests**

```bash
npx jest blog.service.spec --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 8.8: Create `src/blog/blog.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { BlogService } from './blog.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

@ApiTags('blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all posts (all statuses)' })
  findAll(@Query() pagination: PaginationDto) {
    return this.blogService.findAll(pagination.page, pagination.limit);
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'List published posts (public)' })
  findPublic(@Query() pagination: PaginationDto) {
    return this.blogService.findPublic(pagination.page, pagination.limit);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single post by ID' })
  findOne(@Param('id') id: string) {
    return this.blogService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new blog post' })
  create(@Body() dto: CreateBlogPostDto, @CurrentUser() user: any) {
    return this.blogService.create(dto, user);
  }

  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a post (staff: own posts only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBlogPostDto,
    @CurrentUser() user: any,
  ) {
    return this.blogService.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a post (super_admin only)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.blogService.remove(id, user);
  }
}
```

- [ ] **Step 8.9: Create `src/blog/blog.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardModule } from '../dashboard/dashboard.module';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { BlogPost } from './entities/blog-post.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BlogPost]), DashboardModule],
  controllers: [BlogController],
  providers: [BlogService],
})
export class BlogModule {}
```

- [ ] **Step 8.10: Commit**

```bash
git add src/blog/
git commit -m "feat: add BlogModule — CRUD, RBAC, SEO mapping, activity logging"
```

---

## Task 9: NotificationsModule

**Files:**
- Create: `src/notifications/notifications.service.ts`
- Create: `src/notifications/notifications.controller.ts`
- Create: `src/notifications/notifications.module.ts`

- [ ] **Step 9.1: Create `src/notifications/notifications.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
  ) {}

  async findAll(user: User, page: number, limit: number): Promise<PaginatedResponse<Notification>> {
    const [data, total] = await this.notifRepo.findAndCount({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async markOneAsRead(id: string, user: User) {
    const notif = await this.notifRepo.findOne({
      where: { id, user: { id: user.id } },
    });
    if (!notif) throw new NotFoundException('Notification not found');
    notif.read = true;
    return this.notifRepo.save(notif);
  }

  async markAllAsRead(user: User) {
    await this.notifRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ read: true })
      .where('user_id = :userId', { userId: user.id })
      .execute();
  }
}
```

- [ ] **Step 9.2: Create `src/notifications/notifications.controller.ts`**

```typescript
import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  findAll(@Query() pagination: PaginationDto, @CurrentUser() user: any) {
    return this.notificationsService.findAll(user, pagination.page, pagination.limit);
  }

  // IMPORTANT: read-all must be registered BEFORE /:id/read
  // otherwise NestJS matches "read-all" as the :id param
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllAsRead(user);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markOneAsRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.markOneAsRead(id, user);
  }
}
```

- [ ] **Step 9.3: Create `src/notifications/notifications.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 9.4: Commit**

```bash
git add src/notifications/
git commit -m "feat: add NotificationsModule — list, read-all, read-one (correct route order)"
```

---

## Task 10: ProfileModule

**Files:**
- Create: `src/profile/dto/update-profile.dto.ts`
- Create: `src/profile/dto/change-password.dto.ts`
- Create: `src/profile/profile.service.ts`
- Create: `src/profile/profile.controller.ts`
- Create: `src/profile/profile.module.ts`

- [ ] **Step 10.1: Create `src/profile/dto/update-profile.dto.ts`**

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatar?: string;
}
```

- [ ] **Step 10.2: Create `src/profile/dto/change-password.dto.ts`**

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
```

- [ ] **Step 10.3: Create `src/profile/profile.service.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly usersService: UsersService) {}

  async getProfile(userId: string) {
    return this.usersService.findById(userId);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.usersService.update(userId, dto);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersService.findById(userId);
    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.update(userId, { password: hashed });
  }
}
```

- [ ] **Step 10.4: Create `src/profile/profile.controller.ts`**

```typescript
import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser() user: any) {
    return this.profileService.getProfile(user.id);
  }

  @Put()
  @ApiOperation({ summary: 'Update name, email, or avatar' })
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(user.id, dto);
  }

  @Put('password')
  @ApiOperation({ summary: 'Change password — requires current password' })
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.profileService.changePassword(user.id, dto);
  }
}
```

- [ ] **Step 10.5: Create `src/profile/profile.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [UsersModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
```

- [ ] **Step 10.6: Commit**

```bash
git add src/profile/
git commit -m "feat: add ProfileModule — get, update, change-password"
```

---

## Task 11: UploadModule

**Files:**
- Create: `src/upload/upload.service.ts`
- Create: `src/upload/upload.controller.ts`
- Create: `src/upload/upload.module.ts`

- [ ] **Step 11.1: Create `src/upload/upload.service.ts`**

```typescript
import { BadRequestException, Injectable } from '@nestjs/common';

const VALID_TYPES = ['avatar', 'blog-image', 'og-image'];
const TYPE_TO_FOLDER: Record<string, string> = {
  avatar: 'avatars',
  'blog-image': 'blog-images',
  'og-image': 'og-images',
};

@Injectable()
export class UploadService {
  getUploadUrl(type: string, filename: string): string {
    if (!VALID_TYPES.includes(type)) {
      throw new BadRequestException(`type must be one of: ${VALID_TYPES.join(', ')}`);
    }
    const folder = TYPE_TO_FOLDER[type];
    return `/uploads/${folder}/${filename}`;
  }
}
```

- [ ] **Step 11.2: Create `src/upload/upload.controller.ts`**

```typescript
import {
  BadRequestException,
  Controller,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { UploadService } from './upload.service';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const TYPE_TO_FOLDER: Record<string, string> = {
  avatar: 'uploads/avatars',
  'blog-image': 'uploads/blog-images',
  'og-image': 'uploads/og-images',
};

@ApiTags('upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @ApiOperation({ summary: 'Upload an image file' })
  @ApiQuery({ name: 'type', enum: ['avatar', 'blog-image', 'og-image'] })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const type = req.query.type as string;
          const folder = TYPE_TO_FOLDER[type] || 'uploads/misc';
          fs.mkdirSync(folder, { recursive: true });
          cb(null, folder);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), false);
        }
      },
    }),
  )
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('type') type: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const url = this.uploadService.getUploadUrl(type, file.filename);
    return { url };
  }
}
```

- [ ] **Step 11.3: Create `src/upload/upload.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
```

- [ ] **Step 11.4: Commit**

```bash
git add src/upload/
git commit -m "feat: add UploadModule — multer disk storage, MIME/size validation"
```

---

## Task 12: App Module Wiring, main.ts & Swagger

**Files:**
- Modify: `src/app.module.ts`
- Modify: `src/app.controller.ts`
- Modify: `src/app.service.ts`
- Modify: `src/main.ts`

- [ ] **Step 12.1: Update `src/app.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  getHealth() {
    return this.appService.getHealth();
  }
}
```

- [ ] **Step 12.2: Update `src/app.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
```

- [ ] **Step 12.3: Update `src/app.module.ts` with all modules and global guards**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BlogModule } from './blog/blog.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfileModule } from './profile/profile.module';
import { UploadModule } from './upload/upload.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get<number>('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.name'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
      }),
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    UsersModule,
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

- [ ] **Step 12.4: Replace `src/main.ts`**

```typescript
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: [process.env.FRONTEND_ORIGIN, 'https://mymquid.com'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Swagger — mounted at /api/docs, outside the api/v1 prefix
  const swaggerConfig = new DocumentBuilder()
    .setTitle('MyMquid Elevate API')
    .setDescription('Admin platform REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 3000);
  console.log(`Server running on http://localhost:${process.env.PORT || 3000}`);
  console.log(`Swagger UI: http://localhost:${process.env.PORT || 3000}/api/docs`);
}

bootstrap();
```

- [ ] **Step 12.5: Build to verify no compile errors**

```bash
npm run build
```

Expected: `dist/` folder created, zero TypeScript errors.

- [ ] **Step 12.6: Commit**

```bash
git add src/app.module.ts src/app.controller.ts src/app.service.ts src/main.ts
git commit -m "feat: wire all modules, add global guards, filters, interceptors, Swagger"
```

---

## Task 13: Database Seed Script

**Files:**
- Create: `src/database/seed.ts`

- [ ] **Step 13.1: Create `src/database/seed.ts`**

```typescript
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { User } from '../users/entities/user.entity';
import { BlogPost } from '../blog/entities/blog-post.entity';
import { Notification } from '../notifications/entities/notification.entity';

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [User, BlogPost, Notification],
  synchronize: true,
});

async function seed() {
  await dataSource.initialize();
  console.log('Connected to database');

  const userRepo = dataSource.getRepository(User);
  const blogRepo = dataSource.getRepository(BlogPost);
  const notifRepo = dataSource.getRepository(Notification);

  // Seed super_admin user
  const existing = await userRepo.findOne({ where: { email: 'admin@mymquid.com' } });
  if (!existing) {
    const password = await bcrypt.hash('Admin1234!', 10);
    const admin = userRepo.create({
      name: 'Patrick Evra',
      email: 'admin@mymquid.com',
      password,
      role: 'super_admin',
    });
    await userRepo.save(admin);
    console.log('Created super_admin user: admin@mymquid.com');

    // Seed blog posts
    const posts = [
      {
        title: 'Welcome to MyMquid Elevate',
        slug: 'welcome-to-mymquid-elevate',
        content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Welcome!' }] }] }),
        status: 'published' as const,
        category: 'Company News',
        tags: ['welcome', 'announcement'],
        metaTitle: 'Welcome to MyMquid Elevate',
        metaDescription: 'An introduction to the MyMquid Elevate platform.',
        author: admin,
      },
      {
        title: 'Getting Started with Our Solutions',
        slug: 'getting-started-solutions',
        content: JSON.stringify({ type: 'doc', content: [] }),
        status: 'draft' as const,
        category: 'Solutions',
        tags: ['guide'],
        metaTitle: 'Getting Started',
        metaDescription: 'How to get started with MyMquid solutions.',
        author: admin,
      },
      {
        title: 'Scheduled Post',
        slug: 'scheduled-post-example',
        content: JSON.stringify({ type: 'doc', content: [] }),
        status: 'scheduled' as const,
        category: 'Insights',
        tags: [],
        metaTitle: 'Scheduled Post',
        metaDescription: 'This post is scheduled for future publishing.',
        scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        author: admin,
      },
    ];

    for (const p of posts) {
      await blogRepo.save(blogRepo.create(p));
    }
    console.log('Created 3 sample blog posts');

    // Seed notifications
    const notifications = [
      { title: 'Welcome!', message: 'Your admin account is ready.', type: 'success' as const, user: admin },
      { title: 'New Feature', message: 'Blog scheduling is now available.', type: 'info' as const, user: admin },
      { title: 'Action Required', message: 'Please update your profile photo.', type: 'warning' as const, user: admin },
    ];

    for (const n of notifications) {
      await notifRepo.save(notifRepo.create(n));
    }
    console.log('Created 3 sample notifications');
  } else {
    console.log('Seed data already exists — skipping');
  }

  await dataSource.destroy();
  console.log('Done.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

- [ ] **Step 13.2: Verify seed script compiles**

```bash
npx ts-node -r tsconfig-paths/register src/database/seed.ts
```

Expected: Connects to DB, creates seed data, prints "Done."

If `tsconfig-paths` is not installed, run `npm install --save-dev tsconfig-paths` first.

- [ ] **Step 13.3: Commit**

```bash
git add src/database/
git commit -m "feat: add database seed script with super_admin, posts, notifications"
```

---

## Task 14: README

**Files:**
- Create: `README.md`

- [ ] **Step 14.1: Create `README.md`**

```markdown
# MyMquid Elevate — Backend API

NestJS REST API for the MyMquid Elevate admin platform.

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- NestJS CLI (`npm install -g @nestjs/cli`)

## Setup

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd mymquid-backend
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your PostgreSQL credentials and a strong JWT_SECRET
   ```

3. **Create database**
   Open TablePlus (or any PostgreSQL client) and create a database named `mymquid_db`.

4. **Start development server**
   ```bash
   npm run start:dev
   ```
   TypeORM will auto-create all tables on first run (`synchronize: true`).

5. **Seed sample data**
   ```bash
   npx ts-node -r tsconfig-paths/register src/database/seed.ts
   ```

## API

- **Base URL:** `http://localhost:3000/api/v1`
- **Swagger UI:** `http://localhost:3000/api/docs`
- **Health check:** `GET http://localhost:3000/api/v1/health`

## Default Login

| Field    | Value                  |
|----------|------------------------|
| Email    | admin@mymquid.com      |
| Password | Admin1234!             |
| Role     | super_admin            |

## Uploaded Files

Files uploaded via `POST /api/v1/upload?type=avatar|blog-image|og-image` are stored in:
```
uploads/
  avatars/
  blog-images/
  og-images/
```
and served at `GET /uploads/<folder>/<filename>`.

## Scripts

| Command                    | Description                     |
|----------------------------|---------------------------------|
| `npm run start:dev`        | Start with hot reload           |
| `npm run build`            | Compile to dist/                |
| `npm run start:prod`       | Run compiled build              |
| `npm run test`             | Run unit tests                  |
| `npm run test:e2e`         | Run end-to-end tests            |
```

- [ ] **Step 14.2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
```

---

## Final Verification

- [ ] **Run all unit tests**

```bash
npm run test -- --no-coverage
```

Expected: All tests pass.

- [ ] **Build for production**

```bash
npm run build
```

Expected: No TypeScript errors.

- [ ] **Start server and verify Swagger loads**

```bash
npm run start:dev
```

Open `http://localhost:3000/api/docs` — should show all API groups: auth, blog, dashboard, notifications, profile, upload, health.

- [ ] **Test login end-to-end**

After seeding, test via Swagger or curl:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mymquid.com","password":"Admin1234!"}'
```

Expected: `{ "access_token": "...", "user": { "id": "...", "email": "admin@mymquid.com", ... } }`
The `password` field must NOT appear in the response.
```
