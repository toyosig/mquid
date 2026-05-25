import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ActivityEvent } from './entities/activity-event.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ActivityEvent)
    private readonly activityRepo: Repository<ActivityEvent>,
  ) {}

  async logActivity(
    type: 'publish' | 'draft' | 'login' | 'delete' | 'edit',
    message: string,
    user: User,
  ): Promise<void> {
    // Will be fully implemented in Task 7
    const event = this.activityRepo.create({ type, message, user });
    await this.activityRepo.save(event);
  }
}
