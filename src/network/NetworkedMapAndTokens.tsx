import { useState, useEffect, useRef } from "react";
import { useToasts } from "react-toast-notifications";

import { useMapData } from "../contexts/MapDataContext";
import { useMapLoading } from "../contexts/MapLoadingContext";
import { useUserId } from "../contexts/UserIdContext";
import { useDatabase } from "../contexts/DatabaseContext";
import { useParty } from "../contexts/PartyContext";
import { useAssets } from "../contexts/AssetsContext";

import useDebounce from "../hooks/useDebounce";
import useNetworkedState from "../hooks/useNetworkedState";
import useMapActions from "../hooks/useMapActions";

import Session, { PeerDataEvent, PeerDataProgressEvent } from "./Session";
import useAssetTransfer from "./useAssetTransfer";

import Action from "../actions/Action";

import Map from "../components/map/Map";
import TokenBar from "../components/token/TokenBar";

import GlobalImageDrop from "../components/image/GlobalImageDrop";

import { Map as MapType } from "../types/Map";
import { MapState } from "../types/MapState";
import {
  Asset,
  AssetManifest,
  AssetManifestAsset,
  AssetManifestAssets,
} from "../types/Asset";
import { TokenState } from "../types/TokenState";
import { DrawingState } from "../types/Drawing";
import { SpellTemplateState } from "../types/SpellTemplate";
import { Note } from "../types/Note";
import { TokenNote } from "../types/TokenNote";
import { WallState } from "../types/Wall";
import { MapStateSettingsChangeEventHandler } from "../types/Events";
import {
  AddStatesAction,
  EditStatesAction,
  RemoveStatesAction,
} from "../actions";

/**
 * @typedef {object} NetworkedMapProps
 * @property {Session} session
 */

/**
 * @param {NetworkedMapProps} props
 */
function NetworkedMapAndTokens({
  session,
  gameId,
}: {
  session: Session;
  gameId: string;
}) {
  const { addToast } = useToasts();
  const userId = useUserId();
  const partyState = useParty();
  const { assetLoadStart, assetProgressUpdate, isLoading } = useMapLoading();

  const { updateMapState } = useMapData();
  const { getAsset, putAsset } = useAssets();

  const [currentMap, setCurrentMap] = useState<MapType | null>(null);
  const [currentMapState, setCurrentMapState] =
    useNetworkedState<MapState | null>(
      null,
      session,
      "map_state",
      500,
      true,
      "mapId"
    );
  const [assetManifest, setAssetManifest] =
    useNetworkedState<AssetManifest | null>(
      null,
      session,
      "manifest",
      500,
      true,
      "mapId"
    );

  async function loadAssetManifestFromMap(map: MapType, mapState: MapState) {
    const assets: AssetManifestAssets = {};
    const { owner } = map;
    let processedTokens = new Set();
    for (let tokenState of Object.values(mapState.tokens)) {
      if (tokenState.type === "file" && !processedTokens.has(tokenState.file)) {
        processedTokens.add(tokenState.file);
        assets[tokenState.file] = {
          id: tokenState.file,
          owner: tokenState.owner,
        };
      }
    }
    if (map.type === "file") {
      assets[map.thumbnail] = { id: map.thumbnail, owner };
      if (map.quality !== "original") {
        const qualityId = map.resolutions[map.quality];
        if (qualityId) {
          assets[qualityId] = { id: qualityId, owner };
        }
      } else {
        assets[map.file] = { id: map.file, owner };
      }
    }
    setAssetManifest({ mapId: map.id, assets }, true, true);
  }

  function addAssetsIfNeeded(assets: AssetManifestAsset[]) {
    setAssetManifest((prevManifest) => {
      if (prevManifest?.assets) {
        let newAssets = { ...prevManifest.assets };
        for (let asset of assets) {
          const id = asset.id;
          const exists = id in newAssets;
          if (!exists) {
            newAssets[id] = asset;
          }
        }
        return { ...prevManifest, assets: newAssets };
      }
      return prevManifest;
    });
  }

  const { assetApiBase, uploadAsset, downloadAsset } = useAssetTransfer(gameId);

  // Keep track of assets we are already requesting to prevent from loading them multiple times
  const requestingAssetsRef = useRef(new Set());
  const pendingAssetTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );
  const assetDownloadFailuresRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!assetManifest || !userId) {
      return;
    }

    async function requestAssetsIfNeeded() {
      if (!assetManifest) {
        return;
      }
      for (let asset of Object.values(assetManifest.assets)) {
        if (
          asset.owner === userId ||
          requestingAssetsRef.current.has(asset.id)
        ) {
          continue;
        }

        const ownerEntry = Object.entries(partyState).find(([, player]) => {
          return player.userId === asset.owner;
        });

        const ownerSessionId = ownerEntry?.[0];
        const ownerState = ownerEntry?.[1];

        // Ensure requests are added before any async operation to prevent duplicate sends
        requestingAssetsRef.current.add(asset.id);

        const cachedAsset = await getAsset(asset.id);
        if (!ownerState || !ownerSessionId) {
          // Add no owner toast if we don't have asset in our cache
          if (!cachedAsset) {
            // TODO: Stop toast from appearing multiple times
            addToast("Unable to find owner for asset");
          }
          requestingAssetsRef.current.delete(asset.id);
          continue;
        }

        const targetSessionId = ownerState.sessionId || ownerSessionId;

        if (cachedAsset) {
          requestingAssetsRef.current.delete(asset.id);
        } else if (targetSessionId) {
          assetLoadStart(asset.id);
          const sentViaP2P = await session.sendAssetTo(
            targetSessionId,
            "assetRequest",
            {
              id: asset.id,
              gameId,
            },
            undefined,
            { allowRelayFallback: false }
          );
          if (!sentViaP2P) {
            if (!assetApiBase) {
              addToast("图片服务未配置，无法回退下载");
              requestingAssetsRef.current.delete(asset.id);
              assetProgressUpdate({ id: asset.id, total: 1, count: 1 });
              continue;
            }
            void session.sendAssetTo(
              targetSessionId,
              "assetP2pFailed",
              {
                id: asset.id,
                gameId,
              },
              asset.id,
              { allowRelayFallback: true }
            );
            continue;
          }
          const existingTimeout = pendingAssetTimeoutsRef.current[asset.id];
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }
          pendingAssetTimeoutsRef.current[asset.id] = setTimeout(() => {
            if (!requestingAssetsRef.current.has(asset.id)) {
              return;
            }
            if (!assetApiBase) {
              addToast("图片服务未配置，无法回退下载");
              requestingAssetsRef.current.delete(asset.id);
              assetProgressUpdate({ id: asset.id, total: 1, count: 1 });
              return;
            }
            void session.sendAssetTo(
              targetSessionId,
              "assetP2pFailed",
              {
                id: asset.id,
                gameId,
              },
              asset.id,
              { allowRelayFallback: true }
            );
          }, 8000);
        } else {
          // 无法立即请求，解除锁定以便后续重试
          requestingAssetsRef.current.delete(asset.id);
        }
      }
    }

    requestAssetsIfNeeded();
  }, [
    assetManifest,
    partyState,
    session,
    userId,
    addToast,
    getAsset,
    assetLoadStart,
    assetProgressUpdate,
    assetApiBase,
    gameId,
  ]);

  /**
   * Map state
   */

  const { database } = useDatabase();
  // Sync the map state to the database after 500ms of inactivity
  const debouncedMapState = useDebounce(currentMapState, 500);
  useEffect(() => {
    if (
      debouncedMapState &&
      debouncedMapState.mapId &&
      currentMap &&
      currentMap?.owner === userId &&
      database
    ) {
      updateMapState(debouncedMapState.mapId, debouncedMapState);
    }
  }, [currentMap, debouncedMapState, userId, database, updateMapState]);

  async function handleMapChange(
    newMap: MapType | null,
    newMapState: MapState | null
  ) {
    // Clear map before sending new one
    setCurrentMap(null);
    session.socket?.emit("map", null);

    setCurrentMapState(newMapState, true, true);
    setCurrentMap(newMap);

    session.socket?.emit("map", newMap);

    if (!newMap || !newMapState) {
      setAssetManifest(null, true, true);
      return;
    }

    await loadAssetManifestFromMap(newMap, newMapState);
  }

  const [mapActions, addActions, updateActionIndex, resetActions] =
    useMapActions(setCurrentMapState);

  function handleMapReset(newMapState: MapState) {
    setCurrentMapState(newMapState, true, true);
    resetActions();
  }

  function handleMapDraw(action: Action<DrawingState>) {
    addActions([{ type: "drawings", action }]);
  }

  function handleWallDraw(action: Action<WallState>) {
    addActions([{ type: "walls", action }]);
  }

  function handleTemplateDraw(action: Action<SpellTemplateState>) {
    addActions([{ type: "templates", action }]);
  }

  const handleMapStateChange: MapStateSettingsChangeEventHandler = (change) => {
    if (
      currentMapState &&
      Array.isArray(change.explored) &&
      change.explored.length === 0
    ) {
      setCurrentMapState(
        (prevState) => {
          if (!prevState) {
            return prevState;
          }
          return { ...prevState, ...change };
        },
        false,
        false,
        true
      );
      session.socket?.emit("explored_reset", { mapId: currentMapState.mapId });
      return;
    }
    setCurrentMapState((prevState) => {
      if (!prevState) {
        return prevState;
      }
      return { ...prevState, ...change };
    });
  };

  function handleUndo() {
    updateActionIndex(-1);
  }

  function handleRedo() {
    updateActionIndex(1);
  }

  // If map changes clear map actions
  const previousMapIdRef = useRef<string>();
  useEffect(() => {
    if (currentMap && currentMap?.id !== previousMapIdRef.current) {
      resetActions();
      previousMapIdRef.current = currentMap?.id;
    }
  }, [currentMap, resetActions]);

  function handleNoteCreate(notes: Note[]) {
    const action = new AddStatesAction(notes);
    addActions([{ type: "notes", action }]);
  }

  function handleNoteChange(changes: Record<string, Partial<Note>>) {
    let edits: Partial<Note>[] = [];
    for (let id in changes) {
      edits.push({ ...changes[id], id });
    }
    const action = new EditStatesAction(edits);
    addActions([{ type: "notes", action }]);
  }

  function handleNoteRemove(noteIds: string[]) {
    const action = new RemoveStatesAction<Note>(noteIds);
    addActions([{ type: "notes", action }]);
  }

  function handleTokenNoteCreate(notes: TokenNote[]) {
    setCurrentMapState((prevState) => {
      if (!prevState) {
        return prevState;
      }
      const nextTokenNotes = { ...(prevState.tokenNotes || {}) };
      for (const note of notes) {
        nextTokenNotes[note.id] = note;
      }
      return { ...prevState, tokenNotes: nextTokenNotes };
    }, true);
  }

  function handleTokenNoteChange(changes: Record<string, Partial<TokenNote>>) {
    setCurrentMapState((prevState) => {
      if (!prevState) {
        return prevState;
      }
      const nextTokenNotes = { ...(prevState.tokenNotes || {}) };
      for (const id of Object.keys(changes)) {
        const existing = nextTokenNotes[id];
        if (existing) {
          nextTokenNotes[id] = { ...existing, ...changes[id], id };
        }
      }
      return { ...prevState, tokenNotes: nextTokenNotes };
    }, true);
  }

  function handleTokenNoteRemove(noteIds: string[]) {
    setCurrentMapState((prevState) => {
      if (!prevState) {
        return prevState;
      }
      const nextTokenNotes = { ...(prevState.tokenNotes || {}) };
      for (const id of noteIds) {
        delete nextTokenNotes[id];
      }
      return { ...prevState, tokenNotes: nextTokenNotes };
    }, true);
  }

  /**
   * Token state
   */

  async function handleMapTokensStateCreate(tokenStates: TokenState[]) {
    if (!currentMap || !currentMapState) {
      return;
    }

    let assets: AssetManifestAsset[] = [];
    for (let tokenState of tokenStates) {
      if (tokenState.type === "file") {
        assets.push({ id: tokenState.file, owner: tokenState.owner });
      }
    }
    if (assets.length > 0) {
      addAssetsIfNeeded(assets);
    }

    const action = new AddStatesAction(tokenStates);
    addActions([{ type: "tokens", action }]);
  }

  function isTokenPositionOnly(
    changes: Record<string, Partial<TokenState>>
  ): boolean {
    const allowedKeys = new Set(["x", "y", "lastModified", "lastModifiedBy"]);
    return Object.values(changes).every((change) =>
      Object.keys(change).every((key) => allowedKeys.has(key))
    );
  }

  function handleMapTokenStateChange(
    changes: Record<string, Partial<TokenState>>
  ) {
    let edits: Partial<TokenState>[] = [];
    for (let id in changes) {
      edits.push({ ...changes[id], id });
    }
    const action = new EditStatesAction(edits);
    if (currentMapState && isTokenPositionOnly(changes)) {
      addActions([{ type: "tokens", action }], false, true);
      session.socket?.emit("token_positions", {
        mapId: currentMapState.mapId,
        changes,
      });
      return;
    }
    addActions([{ type: "tokens", action }]);
  }

  function handleMapTokenStateRemove(tokenStateIds: string[]) {
    const action = new RemoveStatesAction<TokenState>(tokenStateIds);
    addActions([{ type: "tokens", action }]);
  }

  function handleSelectionItemsChange(
    tokenChanges: Record<string, Partial<TokenState>>,
    noteChanges: Record<string, Partial<Note>>
  ) {
    let tokenEdits: Partial<TokenState>[] = [];
    for (let id in tokenChanges) {
      tokenEdits.push({ ...tokenChanges[id], id });
    }
    const tokenAction = new EditStatesAction(tokenEdits);

    let noteEdits: Partial<Note>[] = [];
    for (let id in noteChanges) {
      noteEdits.push({ ...noteChanges[id], id });
    }
    const noteAction = new EditStatesAction(noteEdits);

    addActions([
      { type: "tokens", action: tokenAction },
      { type: "notes", action: noteAction },
    ]);
  }

  function handleSelectionItemsRemove(
    tokenStateIds: string[],
    noteIds: string[]
  ) {
    const tokenAction = new RemoveStatesAction<TokenState>(tokenStateIds);
    const noteAction = new RemoveStatesAction<Note>(noteIds);
    addActions([
      { type: "tokens", action: tokenAction },
      { type: "notes", action: noteAction },
    ]);
  }

  function handleSelectionItemsCreate(
    tokenStates: TokenState[],
    notes: Note[]
  ) {
    const tokenAction = new AddStatesAction(tokenStates);
    const noteAction = new AddStatesAction(notes);
    addActions([
      { type: "tokens", action: tokenAction },
      { type: "notes", action: noteAction },
    ]);
  }

  useEffect(() => {
    async function handlePeerData({ peer, id, data }: PeerDataEvent) {
      const peerId = peer?.id;
      if (id === "assetRequest") {
        const requestedGameId =
          typeof data?.gameId === "string" ? data.gameId : gameId;
        if (requestedGameId !== gameId) {
          if (typeof data?.id === "string") {
            if (peerId) {
              await session.sendAssetTo(
                peerId,
                "assetResponseFail",
                data.id,
                data.id,
                { allowRelayFallback: true }
              );
            }
          }
          return;
        }

        const asset = await getAsset(data.id);
        if (!asset) {
          if (peerId) {
            await session.sendAssetTo(
              peerId,
              "assetResponseFail",
              data?.id,
              data?.id,
              { allowRelayFallback: true }
            );
          }
          return;
        }

        if (peerId) {
          const sentViaP2P = await session.sendAssetTo(
            peerId,
            "assetResponseSuccess",
            asset,
            asset.id,
            { allowRelayFallback: false }
          );
          if (sentViaP2P) {
            return;
          }
        }
        return;
      }

      if (id === "assetP2pFailed") {
        if (!peerId) {
          return;
        }
        const requestedGameId =
          typeof data?.gameId === "string" ? data.gameId : gameId;
        if (requestedGameId !== gameId) {
          return;
        }
        const asset = await getAsset(data.id);
        if (!asset) {
          await session.sendAssetTo(
            peerId,
            "assetResponseFail",
            data?.id,
            data?.id,
            { allowRelayFallback: true }
          );
          return;
        }
        if (data?.reason === "download_failed") {
          await session.sendAssetTo(
            peerId,
            "assetResponseSuccess",
            asset,
            asset.id,
            { allowRelayFallback: true }
          );
          return;
        }

        let remoteUrl = asset.remoteUrl;
        if (!remoteUrl) {
          try {
            const response = await uploadAsset(asset);
            remoteUrl = response.url;
            await putAsset({
              ...asset,
              remoteUrl,
              size: response.size ?? asset.size,
              originalName: response.originalName ?? asset.originalName,
              source: asset.source ?? "uploaded",
            });
          } catch (error) {
            console.error("ASSET_UPLOAD_ON_DEMAND_FAILED", error);
            await session.sendAssetTo(
              peerId,
              "assetResponseSuccess",
              asset,
              asset.id,
              { allowRelayFallback: true }
            );
            return;
          }
        }

        await session.sendAssetTo(
          peerId,
          "assetResponseUrl",
          {
            id: asset.id,
            url: remoteUrl,
            mime: asset.mime,
            width: asset.width,
            height: asset.height,
            owner: asset.owner,
            size: asset.size,
            originalName: asset.originalName,
          },
          asset.id,
          { allowRelayFallback: true }
        );
        return;
      }

      if (id === "assetResponseUrl") {
        const assetId = data?.id;
        const url = data?.url;
        if (typeof assetId !== "string" || typeof url !== "string") {
          return;
        }

        try {
          const buffer = await downloadAsset(url);
          const assetFromServer: Asset = {
            id: assetId,
            owner: data?.owner ?? "unknown",
            mime: data?.mime ?? "application/octet-stream",
            width: data?.width ?? 0,
            height: data?.height ?? 0,
            file: buffer,
            remoteUrl: url,
            size: data?.size,
            originalName: data?.originalName,
            source: "uploaded",
          };
          await putAsset(assetFromServer);
          delete assetDownloadFailuresRef.current[assetId];
          assetProgressUpdate({ id: assetId, total: 1, count: 1 });
        } catch (error) {
          const status = (error as Error & { status?: number })?.status;
          const isNetworkError =
            status === undefined &&
            error instanceof Error &&
            error.message === "Failed to fetch";
          const isMissing =
            status === 404 ||
            (error instanceof Error &&
              error.message === "asset_download_failed_404");
          if ((isMissing || isNetworkError) && peerId) {
            const previousFailures = assetDownloadFailuresRef.current[assetId] ?? 0;
            const failureCount = previousFailures + 1;
            assetDownloadFailuresRef.current[assetId] = failureCount;
            const forceRelay = failureCount >= 2 || isNetworkError;
            await session.sendAssetTo(
              peerId,
              "assetP2pFailed",
              {
                id: assetId,
                gameId,
                reason: forceRelay ? "download_failed" : "not_found",
              },
              assetId,
              { allowRelayFallback: true }
            );
          } else {
            console.error("ASSET_DOWNLOAD_FAILED", error);
            addToast("图片下载失败，请稍后重试");
          }
        } finally {
          requestingAssetsRef.current.delete(assetId);
          const pendingTimeout = pendingAssetTimeoutsRef.current[assetId];
          if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            delete pendingAssetTimeoutsRef.current[assetId];
          }
        }
        return;
      }

      if (id === "assetResponseSuccess") {
        const asset = data;
        await putAsset(asset);
        delete assetDownloadFailuresRef.current[asset.id];
        requestingAssetsRef.current.delete(asset.id);
        const pendingTimeout = pendingAssetTimeoutsRef.current[asset.id];
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
          delete pendingAssetTimeoutsRef.current[asset.id];
        }
        return;
      }

      if (id === "assetResponseFail") {
        const assetId = data;
        delete assetDownloadFailuresRef.current[assetId];
        requestingAssetsRef.current.delete(assetId);
        assetProgressUpdate({ id: assetId, total: 1, count: 1 });
        addToast("资源传输失败，所有者未找到文件");
        const pendingTimeout = pendingAssetTimeoutsRef.current[assetId];
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
          delete pendingAssetTimeoutsRef.current[assetId];
        }
      }
    }

    function handlePeerDataProgress({
      id,
      total,
      count,
    }: PeerDataProgressEvent) {
      assetProgressUpdate({ id, total, count });
    }

    async function handleSocketMap(map?: MapType) {
      if (map) {
        setCurrentMap(map);
      } else {
        setCurrentMap(null);
      }
    }

    function handleTokenPositions(update: {
      mapId?: string;
      changes?: Record<string, Partial<TokenState>>;
    }) {
      if (!update || !update.changes) {
        return;
      }
      setCurrentMapState(
        (prevState) => {
          if (!prevState || !update.mapId || prevState.mapId !== update.mapId) {
            return prevState;
          }
          const nextTokens = { ...prevState.tokens };
          const changes = update.changes ?? {};
          for (const [id, change] of Object.entries(changes)) {
            const existing = nextTokens[id];
            if (!existing) {
              continue;
            }
            if (existing.type === "file") {
              nextTokens[id] = {
                ...existing,
                ...change,
                type: "file",
              };
            } else {
              nextTokens[id] = {
                ...existing,
                ...change,
                type: "default",
              };
            }
          }
          return { ...prevState, tokens: nextTokens };
        },
        false,
        false,
        true
      );
    }

    function handleExploredReset(update: { mapId?: string }) {
      if (!update?.mapId) {
        return;
      }
      setCurrentMapState(
        (prevState) => {
          if (!prevState || prevState.mapId !== update.mapId) {
            return prevState;
          }
          return { ...prevState, explored: [] };
        },
        false,
        false,
        true
      );
    }

    session.on("peerData", handlePeerData);
    session.on("peerDataProgress", handlePeerDataProgress);
    session.socket?.on("map", handleSocketMap);
    session.socket?.on("token_positions", handleTokenPositions);
    session.socket?.on("explored_reset", handleExploredReset);

    return () => {
      session.off("peerData", handlePeerData);
      session.off("peerDataProgress", handlePeerDataProgress);
      session.socket?.off("map", handleSocketMap);
      session.socket?.off("token_positions", handleTokenPositions);
      session.socket?.off("explored_reset", handleExploredReset);
    };
  });

  const canChangeMap = !isLoading;

  return (
    <GlobalImageDrop
      onMapChange={handleMapChange}
      onMapTokensStateCreate={handleMapTokensStateCreate}
    >
      <Map
        map={currentMap}
        mapState={currentMapState}
        mapActions={mapActions}
        onMapTokenStateChange={handleMapTokenStateChange}
        onMapTokenStateRemove={handleMapTokenStateRemove}
        onMapTokensStateCreate={handleMapTokensStateCreate}
        onSelectionItemsChange={handleSelectionItemsChange}
        onSelectionItemsRemove={handleSelectionItemsRemove}
        onSelectionItemsCreate={handleSelectionItemsCreate}
        onMapChange={handleMapChange}
        onMapReset={handleMapReset}
        onMapStateChange={handleMapStateChange}
        onMapDraw={handleMapDraw}
        onWallDraw={handleWallDraw}
        onMapTemplateDraw={handleTemplateDraw}
        onMapNoteCreate={handleNoteCreate}
        onMapNoteChange={handleNoteChange}
        onMapNoteRemove={handleNoteRemove}
        onMapTokenNoteCreate={handleTokenNoteCreate}
        onMapTokenNoteChange={handleTokenNoteChange}
        onMapTokenNoteRemove={handleTokenNoteRemove}
        allowMapChange={canChangeMap}
        session={session}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
      <TokenBar onMapTokensStateCreate={handleMapTokensStateCreate} />
    </GlobalImageDrop>
  );
}

export default NetworkedMapAndTokens;
