import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const VALID_TYPES = ['avatar', 'blog-image', 'og-image', 'featured-image', 'image'];
const DEFAULT_TYPE = 'blog-image';
const MAX_SIZE = 5 * 1024 * 1024;

@ApiTags('upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Upload a file (avatar, blog-image, og-image)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
          cb(new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), false);
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: MAX_SIZE },
    }),
  )
  async uploadFile(
    @Query('type') type: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const resolvedType = VALID_TYPES.includes(type) ? type : DEFAULT_TYPE;
    const url = await this.uploadService.upload(file.buffer, resolvedType);
    return { url };
  }
}
