import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class BlogListQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['draft', 'published', 'scheduled'] })
  @IsOptional()
  @IsIn(['draft', 'published', 'scheduled'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
