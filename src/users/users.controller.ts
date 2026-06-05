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
  create(@Body() dto: CreateUserDto) {
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
