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
import { User } from '@prisma/client';
import { BlogService } from './blog.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

@ApiTags('blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List posts — super_admin sees all, staff sees own only' })
  findAll(
    @Query() pagination: PaginationDto,
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.blogService.findAll(pagination, user, status, search);
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
  create(@Body() dto: CreateBlogPostDto, @CurrentUser() user: User) {
    return this.blogService.create(dto, user);
  }

  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a post (staff: own posts only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBlogPostDto,
    @CurrentUser() user: User,
  ) {
    return this.blogService.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a post (super_admin only)' })
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.blogService.remove(id, user);
  }
}
