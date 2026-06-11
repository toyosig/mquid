import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminBlogController } from './admin-blog.controller';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

@Module({
  imports: [DashboardModule, NotificationsModule],
  controllers: [BlogController, AdminBlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
