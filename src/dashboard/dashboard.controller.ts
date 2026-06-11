import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Aggregate stats — super_admin sees platform totals, staff sees own counts' })
  getStats(@CurrentUser() user: any) {
    return this.dashboardService.getStats(user);
  }

  @Get('activity')
  @ApiOperation({ summary: 'Recent activity — super_admin sees all, staff sees own' })
  getActivity(@CurrentUser() user: any) {
    return this.dashboardService.getActivity(user);
  }

  @Get('chart')
  @ApiOperation({ summary: 'Posts per day — super_admin sees all posts, staff sees own' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  getChart(@Query('days') days = 30, @CurrentUser() user: any) {
    const d = Math.min(Math.max(Number(days) || 30, 1), 90);
    return this.dashboardService.getChart(d, user);
  }
}
