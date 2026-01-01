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

export function getAssetApiBase() {
  return process.env.REACT_APP_BROKER_URL
    ? `${process.env.REACT_APP_BROKER_URL.replace(/\/$/, "")}/assets`
    : null;
}

export default function useAssetTransfer(gameId: string) {
  const assetApiBase = useMemo(() => getAssetApiBase(), []);

  const resolveRemoteUrl = useCallback(
    (response: UploadAssetResponse): string => {
      const base = assetApiBase?.replace(/\/$/, "");
      const raw = response.url || response.path;
      if (!raw) {
        throw new Error("asset_response_missing_url");
      }
      if (/^https?:\/\//i.test(raw)) {
        return raw;
      }
      if (raw.startsWith("/")) {
        return base ? `${base}${raw}` : raw;
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
    [assetApiBase, gameId]
  );

  const downloadAsset = useCallback(
    async (url: string) => {
      const finalUrl = /^https?:\/\//i.test(url)
        ? url
        : assetApiBase
        ? `${assetApiBase.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`
        : url;

      const response = await fetch(finalUrl, { credentials: "omit" });
    if (!response.ok) {
      throw new Error(`asset_download_failed_${response.status}`);
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
