import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BLOG_CATEGORIES } from '../constants/blog-categories';

export class CreateBlogPostDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'URL-safe slug: lowercase letters, numbers, hyphens' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @ApiProperty({ description: 'Tiptap JSON string — stored as-is' })
  @IsString()
  content: string;

  @ApiProperty({ enum: ['draft', 'published', 'scheduled'] })
  @IsIn(['draft', 'published', 'scheduled'])
  status: 'draft' | 'published' | 'scheduled';

  @ApiProperty({ enum: BLOG_CATEGORIES })
  @IsIn(BLOG_CATEGORIES)
  category: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  featuredImage?: string;

  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MaxLength(60)
  metaTitle: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  metaDescription: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ogImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  scheduledAt?: Date;
}
