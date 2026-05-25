import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from './entities/activity-event.entity';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityEvent])],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
