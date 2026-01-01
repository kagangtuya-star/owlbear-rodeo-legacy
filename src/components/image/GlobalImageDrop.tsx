import React, { useState, useRef } from "react";
import { Box, Flex, Text, Button, Input } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import LoadingOverlay from "../LoadingOverlay";

import ConfirmModal from "../../modals/ConfirmModal";
import Modal from "../Modal";

import { createMapFromFile } from "../../helpers/map";
import { createTokenFromFile } from "../../helpers/token";
import {
  createTokenState,
  clientPositionToMapPosition,
} from "../../helpers/token";
import Vector2 from "../../helpers/Vector2";

import { useUserId } from "../../contexts/UserIdContext";
import { useMapData } from "../../contexts/MapDataContext";
import { useTokenData } from "../../contexts/TokenDataContext";
import { useAssets } from "../../contexts/AssetsContext";
import { useMapStage } from "../../contexts/MapStageContext";

import useImageDrop, { ImageDropEvent } from "../../hooks/useImageDrop";

import { Map } from "../../types/Map";
import { MapState } from "../../types/MapState";
import { TokenState } from "../../types/TokenState";

type GlobalImageDropProps = {
  children?: React.ReactNode;
  onMapChange: (map: Map, mapState: MapState) => void;
  onMapTokensStateCreate: (states: TokenState[]) => void;
};

function GlobalImageDrop({
  children,
  onMapChange,
  onMapTokensStateCreate,
}: GlobalImageDropProps) {
  const { addToast } = useToasts();

  const userId = useUserId();
  const { addMap, getMapState } = useMapData();
  const { addToken } = useTokenData();
  const { addAssets } = useAssets();

  const mapStageRef = useMapStage();

  const [isLargeImageWarningModalOpen, setShowLargeImageWarning] =
    useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const droppedImagesRef = useRef<File[]>();
  const dropPositionRef = useRef<Vector2>();
  const [droppingType, setDroppingType] = useState<"maps" | "tokens">("maps");
  const [isUrlModalOpen, setUrlModalOpen] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");
  const [externalType, setExternalType] = useState<"maps" | "tokens">("maps");

  async function handleDrop({ files, dropPosition }: ImageDropEvent) {
    if (navigator.storage) {
      // Attempt to enable persistant storage
      await navigator.storage.persist();
    }

    dropPositionRef.current = dropPosition;

    droppedImagesRef.current = [];
    for (let file of files) {
      if (file.size > 5e7) {
        addToast(`Unable to import image ${file.name} as it is over 50MB`);
      } else {
        droppedImagesRef.current.push(file);
      }
    }

    // Any file greater than 20MB
    if (droppedImagesRef.current.some((file) => file.size > 2e7)) {
      setShowLargeImageWarning(true);
      return;
    }

    if (droppingType === "maps") {
      await handleMaps();
    } else {
      await handleTokens();
    }
  }

  function handleLargeImageWarningCancel() {
    droppedImagesRef.current = undefined;
    setShowLargeImageWarning(false);
  }

  async function handleLargeImageWarningConfirm() {
    setShowLargeImageWarning(false);
    if (droppingType === "maps") {
      await handleMaps();
    } else {
      await handleTokens();
    }
  }

  function openImportFromUrl(type: "maps" | "tokens") {
    setExternalType(type);
    setExternalUrl("");
    setUrlModalOpen(true);
  }

  function handleUrlModalClose() {
    if (!isLoading) {
      setUrlModalOpen(false);
      setExternalUrl("");
    }
  }

  function getFileNameFromUrl(url: string, fallback: string) {
    try {
      const { pathname } = new URL(url);
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        return decodeURIComponent(segments[segments.length - 1]);
      }
    } catch (error) {
      // Fallback below
    }
    return fallback;
  }

  async function handleExternalUrlImport(
    event?: React.FormEvent<HTMLFormElement>
  ) {
    event?.preventDefault();
    const trimmedUrl = externalUrl.trim();
    if (!trimmedUrl) {
      addToast("请输入图片 URL");
      return;
    }

    try {
      if (!userId) {
        addToast("请先登录后再导入图片");
        return;
      }

      setIsLoading(true);
      if (navigator.storage) {
        await navigator.storage.persist();
      }

      const response = await fetch(trimmedUrl);
      if (!response.ok) {
        throw new Error(`fetch_failed_${response.status}`);
      }

      const contentType =
        response.headers.get("content-type") || "image/png";
      if (!contentType.startsWith("image/")) {
        throw new Error("not_image");
      }

      const buffer = await response.arrayBuffer();
      const fileName = getFileNameFromUrl(
        trimmedUrl,
        `remote-${Date.now()}`
      );
      const file = new File([buffer], fileName, { type: contentType });

      if (externalType === "maps") {
        const { map, assets } = await createMapFromFile(file, userId);
        await addMap(map);
        await addAssets(assets);
        const mapState = await getMapState(map.id);
        if (mapState) {
          onMapChange(map, mapState);
        }
        addToast("地图导入成功");
      } else {
        const { token, assets } = await createTokenFromFile(file, userId);
        await addToken(token);
        await addAssets(assets);
        addToast("标记导入成功");
      }

      setUrlModalOpen(false);
      setExternalUrl("");
    } catch (error) {
      console.error("EXTERNAL_ASSET_IMPORT_FAILED", error);
      addToast("无法从该 URL 加载图片");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMaps() {
    if (droppedImagesRef.current && userId) {
      setIsLoading(true);
      try {
        let maps = [];
        for (let file of droppedImagesRef.current) {
          const { map, assets } = await createMapFromFile(file, userId);
          await addMap(map);
          await addAssets(assets);
          maps.push(map);
        }

        if (maps.length === 1) {
          const mapState = await getMapState(maps[0].id);
          if (mapState) {
            onMapChange(maps[0], mapState);
          }
        }
      } catch (error) {
        console.error("MAP_IMPORT_FAILED", error);
        addToast("导入地图失败，请稍后重试");
      } finally {
        setIsLoading(false);
        droppedImagesRef.current = undefined;
      }
    }
  }

  async function handleTokens() {
    if (droppedImagesRef.current && userId) {
      setIsLoading(true);
      try {
        let tokens = [];
        for (let file of droppedImagesRef.current) {
          const { token, assets } = await createTokenFromFile(file, userId);
          await addToken(token);
          await addAssets(assets);
          tokens.push(token);
        }

        const dropPosition = dropPositionRef.current;
        const mapStage = mapStageRef.current;
        if (mapStage && dropPosition) {
          const mapPosition = clientPositionToMapPosition(mapStage, dropPosition);
          if (mapPosition) {
            let tokenStates = [];
            let offset = new Vector2(0, 0);
            for (let token of tokens) {
              if (!token) {
                continue;
              }
              tokenStates.push(
                createTokenState(
                  token,
                  Vector2.add(mapPosition, offset),
                  userId
                )
              );
              offset = Vector2.add(offset, 0.01);
            }
            if (tokenStates.length > 0) {
              onMapTokensStateCreate(tokenStates);
            }
          }
        }
      } catch (error) {
        console.error("TOKEN_IMPORT_FAILED", error);
        addToast("导入标记失败，请稍后重试");
      } finally {
        setIsLoading(false);
        droppedImagesRef.current = undefined;
      }
    }
  }

  function handleMapsOver() {
    setDroppingType("maps");
  }

  function handleTokensOver() {
    setDroppingType("tokens");
  }

  const { dragging, containerListeners, overlayListeners } =
    useImageDrop(handleDrop);

  return (
    <Flex
      sx={{ height: "100%", flexGrow: 1, position: "relative" }}
      {...containerListeners}
    >
      <Box
        sx={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 110,
          display: dragging ? "none" : "block",
        }}
      >
        <Button
          variant="secondary"
          onClick={() => openImportFromUrl(droppingType)}
        >
          通过 URL 导入
        </Button>
      </Box>
      {children}
      {dragging && (
        <Flex
          sx={{
            position: "absolute",
            top: 0,
            right: 0,
            left: 0,
            bottom: 0,
            cursor: "copy",
            flexDirection: "column",
            zIndex: 100,
          }}
          {...overlayListeners}
        >
          <Flex
            sx={{
              height: "10%",
              justifyContent: "center",
              alignItems: "center",
              color: droppingType === "maps" ? "primary" : "text",
              opacity: droppingType === "maps" ? 1 : 0.8,
              width: "100%",
              position: "relative",
            }}
            onDragEnter={handleMapsOver}
          >
            <Box
              bg="overlay"
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                margin: "4px 16px",
                border: "1px dashed",
                borderRadius: "12px",
                pointerEvents: "none",
              }}
            />
            <Text sx={{ pointerEvents: "none", userSelect: "none" }}>
              Drop as map
            </Text>
          </Flex>
          <Flex
            sx={{
              flexGrow: 1,
              justifyContent: "center",
              alignItems: "center",
              color: droppingType === "tokens" ? "primary" : "text",
              opacity: droppingType === "tokens" ? 1 : 0.8,
              width: "100%",
              position: "relative",
            }}
            onDragEnter={handleTokensOver}
          >
            <Box
              bg="overlay"
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                margin: "4px 16px",
                border: "1px dashed",
                borderRadius: "12px",
                pointerEvents: "none",
              }}
            />
            <Text sx={{ pointerEvents: "none", userSelect: "none" }}>
              Drop as token
            </Text>
          </Flex>
        </Flex>
      )}
      <ConfirmModal
        isOpen={isLargeImageWarningModalOpen}
        onRequestClose={handleLargeImageWarningCancel}
        onConfirm={handleLargeImageWarningConfirm}
        confirmText="Continue"
        label="Warning"
        description="An imported image is larger than 20MB, this may cause slowness. Continue?"
      />
      <Modal
        isOpen={isUrlModalOpen}
        onRequestClose={handleUrlModalClose}
        allowClose={!isLoading}
      >
        <Box
          as="form"
          onSubmit={(event) =>
            handleExternalUrlImport(
              event as unknown as React.FormEvent<HTMLFormElement>
            )
          }
          sx={{
            width: ["90vw", "420px"],
            maxWidth: "480px",
            p: 4,
          }}
        >
          <Text sx={{ mb: 3, fontSize: 2, fontWeight: "bold" }}>
            通过 URL 导入图片
          </Text>
          <Input
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            placeholder="https://example.com/image.png"
            sx={{ mb: 3 }}
            disabled={isLoading}
            required
          />
          <Flex sx={{ gap: 2, mb: 3 }}>
            <Button
              type="button"
              variant={externalType === "maps" ? "primary" : "secondary"}
              onClick={() => setExternalType("maps")}
              disabled={isLoading}
            >
              导入为地图
            </Button>
            <Button
              type="button"
              variant={externalType === "tokens" ? "primary" : "secondary"}
              onClick={() => setExternalType("tokens")}
              disabled={isLoading}
            >
              导入为标记
            </Button>
          </Flex>
          <Flex sx={{ justifyContent: "flex-end", gap: 2 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={handleUrlModalClose}
              disabled={isLoading}
            >
              取消
            </Button>
            <Button type="submit" disabled={isLoading || !externalUrl.trim()}>
              导入
            </Button>
          </Flex>
        </Box>
      </Modal>
      {isLoading && <LoadingOverlay bg="overlay" />}
    </Flex>
  );
}

export default GlobalImageDrop;
