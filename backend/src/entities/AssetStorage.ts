import { promises as fs } from "fs";
import path from "path";

export type StoredAssetPayload = {
  id: string;
  owner: string;
  mime: string;
  width: number;
  height: number;
  data: Buffer;
  originalName?: string;
  size?: number;
};

export type StoredAssetMeta = Omit<StoredAssetPayload, "data"> & {
  gameId: string;
  path: string;
  fileName: string;
  expiresAt: number;
  extension: string;
};

export type StoredAsset = StoredAssetMeta & {
  data: Buffer;
};

export default class AssetStorage {
  private readonly baseDir: string;

  private readonly defaultTtlMs: number;

  private readonly postGameTtlMs: number;

  private readonly cleanupIntervalMs: number;

  private readonly assets: Map<string, StoredAssetMeta>;

  private readonly gameAssets: Map<string, Set<string>>;

  private cleanupTimer: NodeJS.Timeout;

  constructor(
    baseDir: string,
    defaultTtlMs = 24 * 60 * 60 * 1000,
    postGameTtlMs = 15 * 60 * 1000,
    cleanupIntervalMs = 60 * 1000
  ) {
    this.baseDir = baseDir;
    this.defaultTtlMs = defaultTtlMs;
    this.postGameTtlMs = postGameTtlMs;
    this.cleanupIntervalMs = cleanupIntervalMs;
    this.assets = new Map();
    this.gameAssets = new Map();

    void this.initialise();
    this.cleanupTimer = setInterval(() => {
      void this.cleanup();
    }, this.cleanupIntervalMs);
    this.cleanupTimer.unref();
  }

  private async initialise() {
    await fs.mkdir(this.baseDir, { recursive: true });
    await this.restoreFromDisk();
  }

  private sanitise(value: string) {
    return value.replace(/[^a-zA-Z0-9-_]/g, "_");
  }

  private resolveExtension(payload: StoredAssetPayload) {
    if (payload.originalName) {
      const ext = path.extname(payload.originalName);
      if (ext) {
        return ext;
      }
    }

    const mime = payload.mime.toLowerCase();
    if (mime.includes("png")) {
      return ".png";
    }
    if (mime.includes("jpeg") || mime.includes("jpg")) {
      return ".jpg";
    }
    if (mime.includes("webp")) {
      return ".webp";
    }
    if (mime.includes("gif")) {
      return ".gif";
    }
    if (mime.includes("svg")) {
      return ".svg";
    }
    return ".bin";
  }

  private getMetaFilePath(gameDir: string, fileName: string) {
    return path.join(gameDir, `${fileName}.meta.json`);
  }

  private async writeMetaFile(meta: StoredAssetMeta) {
    const metaRecord = {
      id: meta.id,
      owner: meta.owner,
      mime: meta.mime,
      width: meta.width,
      height: meta.height,
      originalName: meta.originalName,
      size: meta.size,
      gameId: meta.gameId,
      fileName: meta.fileName,
      expiresAt: meta.expiresAt,
      extension: meta.extension,
    };
    const metaPath = this.getMetaFilePath(path.dirname(meta.path), meta.fileName);
    await fs.writeFile(metaPath, JSON.stringify(metaRecord));
  }

  private async removeMetaFile(meta: StoredAssetMeta) {
    const metaPath = this.getMetaFilePath(path.dirname(meta.path), meta.fileName);
    try {
      await fs.unlink(metaPath);
    } catch (error) {
      // ignore
    }
  }

  private async restoreFromDisk() {
    let gameDirectories: string[] = [];
    try {
      gameDirectories = await fs.readdir(this.baseDir);
    } catch (error) {
      return;
    }

    for (const sanitisedGameDir of gameDirectories) {
      const gameDirPath = path.join(this.baseDir, sanitisedGameDir);
      let entries: string[] = [];
      try {
        entries = await fs.readdir(gameDirPath);
      } catch (error) {
        continue;
      }

      for (const entry of entries) {
        if (!entry.endsWith(".meta.json")) {
          continue;
        }
        const metaPath = path.join(gameDirPath, entry);
        try {
          const raw = await fs.readFile(metaPath, "utf8");
          const record = JSON.parse(raw) as Omit<StoredAssetMeta, "path">;
          const filePath = path.join(gameDirPath, record.fileName);
          const meta: StoredAssetMeta = {
            ...record,
            path: filePath,
          };

          try {
            await fs.stat(filePath);
          } catch (error) {
            await this.removeMetaFile(meta);
            continue;
          }

          if (meta.expiresAt <= Date.now()) {
            await this.deleteFile(filePath);
            await this.removeMetaFile(meta);
            continue;
          }

          this.trackAsset(meta);
        } catch (error) {
          // Corrupted metadata, skip
          continue;
        }
      }
    }
  }

  private async ensureGameDirectory(gameId: string) {
    const gameDir = path.join(this.baseDir, this.sanitise(gameId));
    await fs.mkdir(gameDir, { recursive: true });
    return gameDir;
  }

  private trackAsset(asset: StoredAssetMeta) {
    this.assets.set(asset.id, asset);
    let gameSet = this.gameAssets.get(asset.gameId);
    if (!gameSet) {
      gameSet = new Set();
      this.gameAssets.set(asset.gameId, gameSet);
    }
    gameSet.add(asset.id);
  }

  private untrackAsset(asset: StoredAssetMeta) {
    this.assets.delete(asset.id);
    const gameSet = this.gameAssets.get(asset.gameId);
    if (gameSet) {
      gameSet.delete(asset.id);
      if (gameSet.size === 0) {
        this.gameAssets.delete(asset.gameId);
      }
    }
  }

  private async deleteFile(filePath: string) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore removal errors to avoid breaking cleanup
    }
    // Attempt to remove parent directory if empty
    const parent = path.dirname(filePath);
    try {
      await fs.rmdir(parent);
    } catch (error) {
      // Directory not empty or removal failed – safe to ignore
    }
  }

  async saveAsset(
    gameId: string,
    payload: StoredAssetPayload,
    ttlOverride?: number
  ): Promise<void> {
    const sanitisedGameId = this.sanitise(gameId);
    const gameDir = await this.ensureGameDirectory(sanitisedGameId);
    const extension = this.resolveExtension(payload);
    const filename = `${this.sanitise(payload.id)}${extension}`;
    const filePath = path.join(gameDir, filename);

    await fs.writeFile(filePath, payload.data);

    const expiresAt = Date.now() + (ttlOverride ?? this.defaultTtlMs);
    const { data, size, originalName, ...metaPayload } = payload;

    const stored: StoredAssetMeta = {
      ...metaPayload,
      originalName,
      size: size ?? data.byteLength,
      gameId,
      path: filePath,
      fileName: filename,
      expiresAt,
      extension,
    };

    await this.writeMetaFile(stored);
    this.trackAsset(stored);
  }

  public getAssetMeta(assetId: string): StoredAssetMeta | undefined {
    const meta = this.assets.get(assetId);
    if (!meta) {
      return undefined;
    }
    if (meta.expiresAt <= Date.now()) {
      void this.deleteAsset(assetId);
      return undefined;
    }
    return meta;
  }

  public getAssetPath(assetId: string): string | undefined {
    const meta = this.getAssetMeta(assetId);
    if (!meta) {
      return undefined;
    }
    return meta.path;
  }

  async getAsset(assetId: string): Promise<StoredAsset | undefined> {
    const meta = this.getAssetMeta(assetId);
    if (!meta) {
      return undefined;
    }

    try {
      const file = await fs.readFile(meta.path);
      return {
        ...meta,
        data: file,
      };
    } catch (error) {
      await this.deleteAsset(assetId);
      return undefined;
    }
  }

  async deleteAsset(assetId: string): Promise<void> {
    const meta = this.assets.get(assetId);
    if (!meta) {
      return;
    }

    await this.removeMetaFile(meta);
    await this.deleteFile(meta.path);
    this.untrackAsset(meta);
  }

  markGameActive(gameId: string) {
    const gameSet = this.gameAssets.get(gameId);
    if (!gameSet) {
      return;
    }
    const newExpiry = Date.now() + this.defaultTtlMs;
    for (const assetId of gameSet) {
      const meta = this.assets.get(assetId);
      if (meta) {
        meta.expiresAt = newExpiry;
      }
    }
  }

  markGameForCleanup(gameId: string, ttlOverride?: number) {
    const gameSet = this.gameAssets.get(gameId);
    if (!gameSet) {
      return;
    }
    const newExpiry = Date.now() + (ttlOverride ?? this.postGameTtlMs);
    for (const assetId of gameSet) {
      const meta = this.assets.get(assetId);
      if (meta) {
        meta.expiresAt = Math.min(meta.expiresAt, newExpiry);
      }
    }
  }

  private async cleanup() {
    const now = Date.now();
    for (const [assetId, meta] of this.assets.entries()) {
      if (meta.expiresAt <= now) {
        await this.deleteAsset(assetId);
      }
    }
  }
}
