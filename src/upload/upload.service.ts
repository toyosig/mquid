import { BadRequestException, Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

const FOLDER_MAP: Record<string, string> = {
  avatar: 'mquid/avatars',
  'blog-image': 'mquid/blog-images',
  'og-image': 'mquid/og-images',
};

@Injectable()
export class UploadService {
  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.warn('[UploadService] Cloudinary env vars missing — uploads will fail at runtime');
    }

    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  }

  async upload(buffer: Buffer, type: string): Promise<string> {
    const folder = FOLDER_MAP[type];
    if (!folder) throw new BadRequestException(`Invalid upload type: ${type}`);

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error: any, result: any) => {
          if (error || !result) return reject(new BadRequestException('Upload to Cloudinary failed'));
          resolve(result.secure_url);
        },
      );
      Readable.from(buffer).pipe(stream);
    });
  }
}
