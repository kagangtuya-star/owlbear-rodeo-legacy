import { useCallback, useMemo } from "react";
import { uint8ToBase64 } from "../helpers/base64";
import { Asset } from "../types/Asset";

export type UploadAssetResponse = {
  id: string;
  url?: string;
  path?: string;
  mime: string;
  width: number;
  height: number;
  size?: number;
  originalName?: string;
};

function normalizeAssetBase(brokerUrl: string | undefined) {
  if (!brokerUrl) {
    return null;
  }
  const trimmed = brokerUrl.replace(/\/$/, "");
  const root = trimmed.replace(/\/assets$/, "");
  return `${root}/assets`;
}

function dedupeAssetsPath(url: string) {
  return url.replace(/\/assets\/assets\//g, "/assets/");
}

export function getAssetApiBase() {
  return normalizeAssetBase(process.env.REACT_APP_BROKER_URL);
}

export default function useAssetTransfer(gameId: string) {
  const assetApiBase = useMemo(() => getAssetApiBase(), []);

  const resolveRemoteUrl = useCallback(
    (response: UploadAssetResponse): string => {
      const base = assetApiBase?.replace(/\/$/, "");
      const baseRoot = base?.replace(/\/assets$/, "");
      const raw = response.url || response.path;
      if (!raw) {
        throw new Error("asset_response_missing_url");
      }
      if (/^https?:\/\//i.test(raw)) {
        return dedupeAssetsPath(raw);
      }
      if (raw.startsWith("/assets/")) {
        return baseRoot ? `${baseRoot}${raw}` : raw;
      }
      if (raw.startsWith("assets/")) {
        return baseRoot ? `${baseRoot}/${raw}` : `/${raw}`;
      }
      if (raw.startsWith("/")) {
        if (baseRoot) {
          return `${baseRoot}${raw}`;
        }
        return base ? `${base}${raw}` : raw;
      }
      if (baseRoot) {
        return `${baseRoot}/${raw}`;
      }
      return base ? `${base}/${raw}` : raw;
    },
    [assetApiBase]
  );

  const uploadAsset = useCallback(
    async (asset: Asset): Promise<UploadAssetResponse> => {
      if (!assetApiBase) {
        throw new Error("asset_api_missing");
      }
      if (!asset.file || asset.file.length === 0) {
        throw new Error("asset_file_missing");
      }

      const payload = {
        id: asset.id,
        owner: asset.owner,
        mime: asset.mime,
        width: asset.width,
        height: asset.height,
        gameId,
        size: asset.size ?? asset.file.length,
        name: asset.originalName,
        file: uint8ToBase64(asset.file),
      };

      const response = await fetch(`${assetApiBase}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`asset_upload_failed_${response.status}`);
      }

      const result = (await response.json()) as UploadAssetResponse;
      return {
        ...result,
        url: resolveRemoteUrl(result),
      };
    },
    [assetApiBase, gameId, resolveRemoteUrl]
  );

  const downloadAsset = useCallback(
    async (url: string) => {
      const finalUrl = /^https?:\/\//i.test(url)
        ? dedupeAssetsPath(url)
        : assetApiBase
        ? dedupeAssetsPath(
            `${assetApiBase.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`
          )
        : url;

    const response = await fetch(finalUrl, { credentials: "omit" });
    if (!response.ok) {
      const error = new Error(`asset_download_failed_${response.status}`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }, [assetApiBase]);

  return {
    assetApiBase,
    uploadAsset,
    downloadAsset,
  };
}
