import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { BLOG_CATEGORIES } from '../constants/blog-categories';

export class BlogListQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['draft', 'published', 'scheduled'] })
  @IsOptional()
  @IsIn(['draft', 'published', 'scheduled'])
  status?: string;

  @ApiPropertyOptional({ enum: BLOG_CATEGORIES })
  @IsOptional()
  @IsIn(BLOG_CATEGORIES)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
