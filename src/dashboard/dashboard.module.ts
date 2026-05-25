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
