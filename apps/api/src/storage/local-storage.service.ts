import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { ENV, Env } from '../config/env.module';
import { detectImage, StorageService } from './storage.service';

@Injectable()
export class LocalStorageService extends StorageService {
  readonly root: string;
  private readonly baseUrl: string;

  constructor(@Inject(ENV) env: Env) {
    super();
    this.root = resolve(env.UPLOAD_DIR);
    this.baseUrl = `${env.API_URL}/uploads/`;
  }

  async saveImage(buffer: Buffer, folder: string): Promise<string> {
    const type = detectImage(buffer);
    if (!type)
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message: 'Only PNG, JPEG or WebP images are allowed',
      });
    const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '');
    const name = `${randomUUID()}.${type.ext}`;
    const dir = join(this.root, safeFolder);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), buffer);
    return `${this.baseUrl}${safeFolder}/${name}`;
  }

  async delete(url: string | null | undefined): Promise<void> {
    if (!url?.startsWith(this.baseUrl)) return;
    const rel = url.slice(this.baseUrl.length);
    // Rebuild the path from clean parts so "../" can never leave the upload folder.
    const target = join(this.root, dirname(rel).replace(/\.\./g, ''), basename(rel));
    if (!target.startsWith(this.root)) return;
    await unlink(target).catch(() => undefined);
  }
}
