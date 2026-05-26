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
import { diskStorage } from 'multer';
import { UploadService } from './upload.service';
import { UPLOAD_FOLDER_MAP, VALID_UPLOAD_TYPES } from './upload.constants';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

@ApiTags('upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @HttpCode(200)
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
      storage: diskStorage({
        destination: (req: any, _file, cb) => {
          const type = req.query?.type as string;
          const folder = UPLOAD_FOLDER_MAP[type];
          if (!folder) {
            cb(new BadRequestException(`type must be one of: ${VALID_UPLOAD_TYPES.join(', ')}`), '');
            return;
          }
          cb(null, `uploads/${folder}`);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const ext = MIME_TO_EXT[file.mimetype] ?? '.bin';
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
          cb(
            new BadRequestException(
              'Only JPEG, PNG, and WebP images are allowed',
            ),
            false,
          );
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
    if (!VALID_UPLOAD_TYPES.includes(type)) {
      throw new BadRequestException(
        `type must be one of: ${VALID_UPLOAD_TYPES.join(', ')}`,
      );
    }
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return { url: this.uploadService.getPublicUrl(type, file.filename) };
  }
}
