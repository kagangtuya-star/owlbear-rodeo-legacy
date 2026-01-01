export type AssetSource = "uploaded" | "external" | "local";

export type Asset = {
  file: Uint8Array;
  width: number;
  height: number;
  id: string;
  owner: string;
  mime: string;
  remoteUrl?: string;
  size?: number;
  originalName?: string;
  source?: AssetSource;
};

export type AssetManifestAsset = Pick<Asset, "id" | "owner">;
export type AssetManifestAssets = Record<string, AssetManifestAsset>;
export type AssetManifest = { mapId: string; assets: AssetManifestAssets };
