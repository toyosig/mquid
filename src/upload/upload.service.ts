import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { UPLOAD_FOLDER_MAP } from './upload.constants';

const UPLOAD_DIRS = ['uploads/avatars', 'uploads/blog-images', 'uploads/og-images'];

@Injectable()
export class UploadService {
  constructor() {
    // Ensure upload directories exist on service init
    UPLOAD_DIRS.forEach((dir) => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }

  getPublicUrl(type: string, filename: string): string {
    const folder = UPLOAD_FOLDER_MAP[type];
    if (!folder) throw new BadRequestException(`Invalid upload type: ${type}`);
    return `/uploads/${folder}/${filename}`;
  }
}
