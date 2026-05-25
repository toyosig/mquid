import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('blog_posts')
export class BlogPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  title: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: ['draft', 'published', 'scheduled'] })
  status: 'draft' | 'published' | 'scheduled';

  @Column()
  category: string;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @Column({ nullable: true })
  featuredImage: string;

  @Column({ length: 60 })
  metaTitle: string;

  @Column({ length: 160 })
  metaDescription: string;

  @Column({ nullable: true })
  ogImage: string;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date;

  @ManyToOne(() => User, { eager: true })
  author: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
