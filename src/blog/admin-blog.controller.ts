import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BlogService } from './blog.service';
import { AdminBlogQueryDto } from './dto/admin-blog-query.dto';
import { RejectPostDto } from './dto/reject-post.dto';

@ApiTags('admin/posts')
@ApiBearerAuth()
@Roles('super_admin')
@Controller('admin/posts')
export class AdminBlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @ApiOperation({ summary: 'List all posts (filterable by moderation status)' })
  findAll(@Query() query: AdminBlogQueryDto) {
    return this.blogService.adminFindAll(query, query.status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single post (any moderation status)' })
  findOne(@Param('id') id: string) {
    return this.blogService.adminFindOne(id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a blog post' })
  approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.blogService.approvePost(id, user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a blog post with optional reason' })
  reject(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: RejectPostDto) {
    return this.blogService.rejectPost(id, user, dto);
  }
}
