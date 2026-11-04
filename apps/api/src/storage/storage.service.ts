export type ImageType = {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  ext: 'png' | 'jpg' | 'webp';
};

// Abstract class so it can be used as an injection token.
// Dev: local disk. Production: an S3-compatible implementation (planned for the deployment phase).
export abstract class StorageService {
  /** Saves an image and returns its public URL. */
  abstract saveImage(buffer: Buffer, folder: string): Promise<string>;
  /** Deletes a file previously returned by saveImage. Unknown URLs are ignored. */
  abstract delete(url: string): Promise<void>;
}

/** Detects the real image type from the first bytes (the browser's Content-Type is not trusted). */
export function detectImage(b: Buffer): ImageType | null {
  if (
    b.length > 12 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (
    b.length > 12 &&
    b.subarray(0, 4).toString() === 'RIFF' &&
    b.subarray(8, 12).toString() === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}
