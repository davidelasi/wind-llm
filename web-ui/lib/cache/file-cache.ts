import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface CacheEntry<T = any> {
  data: T;
  etag: string;
  timestamp: string;
  expiresAt: string;
  metadata?: any;
}

export class FileCache {
  private cacheDir: string;

  constructor(cacheDir: string = '.cache') {
    // In serverless environments (like Vercel), use /tmp for writable cache
    // Check if we're in a serverless environment by detecting read-only filesystem
    const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT;

    if (isServerless) {
      // Use /tmp in serverless environments (only writable directory)
      this.cacheDir = path.join('/tmp', cacheDir);
    } else {
      // Use project directory in development
      this.cacheDir = path.join(process.cwd(), cacheDir);
    }
  }

  /**
   * Ensure cache directory exists
   */
  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      // Log error but don't throw - gracefully degrade if cache directory can't be created
      console.warn('[FileCache] Unable to create cache directory:', this.cacheDir, error);
    }
  }

  /**
   * Generate cache file path
   */
  private getCachePath(key: string): string {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.cacheDir, `${hash}.json`);
  }

  /**
   * Check if cache entry is valid
   */
  private isValid(entry: CacheEntry, maxAge?: number): boolean {
    const now = new Date();
    const expiresAt = new Date(entry.expiresAt);

    // Check explicit expiry
    if (now > expiresAt) {
      return false;
    }

    // Check max age if provided
    if (maxAge) {
      const entryAge = now.getTime() - new Date(entry.timestamp).getTime();
      if (entryAge > maxAge) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get cached data
   */
  async get<T>(key: string, maxAge?: number): Promise<CacheEntry<T> | null> {
    try {
      const cachePath = this.getCachePath(key);
      const content = await fs.readFile(cachePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(content);

      if (this.isValid(entry, maxAge)) {
        return entry;
      } else {
        // Invalid cache, remove it
        await fs.unlink(cachePath).catch(() => {});
        return null;
      }
    } catch (error) {
      // File doesn't exist or is invalid
      return null;
    }
  }

  /**
   * Set cache data
   */
  async set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000, metadata?: any): Promise<void> {
    try {
      await this.ensureCacheDir();

      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs);

      const entry: CacheEntry<T> = {
        data,
        etag: crypto.createHash('md5').update(JSON.stringify(data)).digest('hex'),
        timestamp: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        metadata
      };

      const cachePath = this.getCachePath(key);
      await fs.writeFile(cachePath, JSON.stringify(entry, null, 2));
    } catch (error) {
      // Gracefully fail if cache write fails - log but don't throw
      console.warn('[FileCache] Unable to write cache file:', key, error);
    }
  }

  /**
   * Delete cache entry
   */
  async delete(key: string): Promise<void> {
    try {
      const cachePath = this.getCachePath(key);
      await fs.unlink(cachePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.cacheDir, file)))
      );
    } catch (error) {
      // Ignore if directory doesn't exist
    }
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<{ totalFiles: number; totalSize: number }> {
    try {
      const files = await fs.readdir(this.cacheDir);
      let totalSize = 0;

      for (const file of files) {
        try {
          const stat = await fs.stat(path.join(this.cacheDir, file));
          totalSize += stat.size;
        } catch {
          // Skip inaccessible files
        }
      }

      return { totalFiles: files.length, totalSize };
    } catch {
      return { totalFiles: 0, totalSize: 0 };
    }
  }
}

// Default cache instance
export const fileCache = new FileCache();

/**
 * HTTP ETag cache helper for Next.js API routes
 */
export function createEtagCache<T>(
  cache: FileCache,
  cacheKey: string,
  ttlMs: number = 5 * 60 * 1000
) {
  return async (
    request: Request,
    fetcher: () => Promise<T>
  ): Promise<{ data: T; etag: string; cached: boolean }> => {
    const clientEtag = request.headers.get('if-none-match');

    // Check if we have cached data
    const cached = await cache.get<T>(cacheKey, ttlMs);

    if (cached) {
      // Return cached data if ETag matches (not modified)
      if (clientEtag === cached.etag) {
        throw { status: 304, etag: cached.etag };
      }

      return { data: cached.data, etag: cached.etag, cached: true };
    }

    // Fetch fresh data
    const data = await fetcher();

    // Cache the result
    await cache.set(cacheKey, data, ttlMs);

    // Generate ETag
    const etag = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');

    return { data, etag, cached: false };
  };
}
