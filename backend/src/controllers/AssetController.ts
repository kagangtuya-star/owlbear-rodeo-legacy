import { Request, Response } from "express";
import AssetStorage, {
  StoredAssetPayload,
} from "../entities/AssetStorage";
import Controller, { Methods } from "./Controller";

export default class AssetController extends Controller {
  public path = "/assets";

  constructor(private storage: AssetStorage) {
    super();
    this.routes = [
      {
        path: "/upload",
        method: Methods.POST,
        handler: this.handleUpload.bind(this),
        localMiddleware: [],
      },
      {
        path: "/:gameId/:assetId",
        method: Methods.GET,
        handler: this.handleDownload.bind(this),
        localMiddleware: [],
      },
    ];
  }

  private buildAssetUrl(req: Request, gameId: string, assetId: string) {
    const baseUrl = (process.env.ASSET_PUBLIC_URL || "")
      .toString()
      .replace(/\/$/, "");
    const origin = baseUrl || `${req.protocol}://${req.get("host")}`;
    return `${origin}${this.path}/${encodeURIComponent(gameId)}/${encodeURIComponent(
      assetId
    )}`;
  }

  private async handleUpload(req: Request, res: Response): Promise<void> {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials", "false");

    const { id, owner, mime, width, height, gameId, ttlMs, file, size, name } =
      req.body || {};

    if (typeof gameId !== "string" || gameId.trim() === "") {
      res.status(400).json({ message: "missing_game_id" });
      return;
    }

    if (typeof id !== "string" || id.trim() === "") {
      res.status(400).json({ message: "missing_asset_id" });
      return;
    }

    if (typeof mime !== "string") {
      res.status(400).json({ message: "missing_mime" });
      return;
    }

    if (typeof file !== "string") {
      res.status(400).json({ message: "missing_file" });
      return;
    }

    const widthValue = Number(width ?? 0);
    const heightValue = Number(height ?? 0);

    let buffer: Buffer;
    try {
      buffer = Buffer.from(file, "base64");
    } catch (error) {
      res.status(400).json({ message: "invalid_base64" });
      return;
    }

    const payload: StoredAssetPayload = {
      id,
      owner: typeof owner === "string" && owner.length > 0 ? owner : "unknown",
      mime,
      width: Number.isFinite(widthValue) ? widthValue : 0,
      height: Number.isFinite(heightValue) ? heightValue : 0,
      data: buffer,
      originalName: typeof name === "string" ? name : undefined,
      size: Number.isFinite(Number(size)) ? Number(size) : buffer.byteLength,
    };

    const ttlOverride =
      ttlMs !== undefined && ttlMs !== null ? Number(ttlMs) : undefined;

    try {
      await this.storage.saveAsset(gameId, payload, ttlOverride);
      const meta = this.storage.getAssetMeta(id);
      const relativePath = `${this.path}/${encodeURIComponent(
        gameId
      )}/${encodeURIComponent(id)}`;
      const absoluteUrl = this.buildAssetUrl(req, gameId, id);
      res.status(201).json({
        id,
        url: process.env.ASSET_PUBLIC_URL ? absoluteUrl : relativePath,
        path: relativePath,
        gameId,
        owner: payload.owner,
        mime: payload.mime,
        width: payload.width,
        height: payload.height,
        size: meta?.size ?? buffer.byteLength,
        originalName: meta?.originalName ?? payload.originalName,
      });
    } catch (error) {
      console.error("ASSET_STORAGE_SAVE_FAILED", error);
      res.status(500).json({ message: "asset_store_failed" });
    }
  }

  private async handleDownload(req: Request, res: Response): Promise<void> {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials", "false");

    const { assetId, gameId } = req.params;
    if (!assetId || !gameId) {
      res.status(400).json({ message: "missing_asset_id" });
      return;
    }

    const meta = this.storage.getAssetMeta(assetId);
    if (!meta || meta.gameId !== gameId) {
      res.status(404).json({ message: "asset_not_found" });
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials", "false");

    const filePath = this.storage.getAssetPath(assetId);
    if (!filePath) {
      res.status(404).json({ message: "asset_not_found" });
      return;
    }

    res.setHeader("Content-Type", meta.mime);
    if (meta.size) {
      res.setHeader("Content-Length", String(meta.size));
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(filePath, (error) => {
      if (error) {
        console.error("ASSET_STREAM_ERROR", error);
        if (!res.headersSent) {
          res.status(500).json({ message: "asset_stream_failed" });
        }
      }
    });
  }
}
