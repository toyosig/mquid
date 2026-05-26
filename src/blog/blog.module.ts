import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

@Module({
  imports: [DashboardModule],
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
