import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { BlogService } from './blog.service';
import { RejectPostDto } from './dto/reject-post.dto';

@ApiTags('admin/posts')
@ApiBearerAuth()
@Roles('super_admin')
@Controller('admin/posts')
export class AdminBlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @ApiOperation({ summary: 'List all posts (filterable by moderation status)' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected'] })
  findAll(@Query() pagination: PaginationDto, @Query('status') status?: string) {
    return this.blogService.adminFindAll(pagination, status);
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
