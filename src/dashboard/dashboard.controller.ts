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
