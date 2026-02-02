import { Group } from "react-konva";
import { v4 as uuid } from "uuid";

import { Map, MapToolId } from "../types/Map";
import { MapState } from "../types/MapState";
import {
  TokenCategory,
  TokenDraggingOptions,
  TokenMenuOptions,
} from "../types/Token";
import { TokenState } from "../types/TokenState";
import { TokenNoteSettings } from "../types/Settings";
import {
  TokenStateRemoveHandler,
  TokenStateChangeEventHandler,
  TokenDragMoveEventHandler,
  TokensStateCreateHandler,
  TokenAttributeCountOpenEventHandler,
  TokenAttributeCountTarget,
} from "../types/Events";
import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import Token from "../components/konva/Token";
import { KonvaEventObject } from "konva/lib/Node";
import TokenMenu from "../components/token/TokenMenu";
import TokenDragOverlay from "../components/token/TokenDragOverlay";
import MapMenu from "../components/map/MapMenu";
import { Box, Input, Text } from "theme-ui";
import { useUserId } from "../contexts/UserIdContext";
import { useBlur, useKeyboard } from "../contexts/KeyboardContext";
import shortcuts from "../shortcuts";
import { buildNextAttributes, parseNumericExpression } from "../helpers/tokenAttributes";

type MapTokenPreviewOptions = {
  enableTokenDragPreview?: boolean;
  onTokenDragMove?: TokenDragMoveEventHandler;
  onTokenDragPreviewEnd?: () => void;
};

type TokenAttributeCountMenuOptions = {
  tokenStateId: string;
  target: TokenAttributeCountTarget;
  left: number;
  top: number;
};

const countMenuWidth = 160;
const countMenuHeight = 84;
const countMenuPadding = 8;

function useMapTokens(
  map: Map | null,
  mapState: MapState | null,
  onTokenStateChange: TokenStateChangeEventHandler,
  onTokenStateRemove: TokenStateRemoveHandler,
  onTokensStateCreate: TokensStateCreateHandler,
  selectedToolId: MapToolId,
  tokenNoteSettings: TokenNoteSettings,
  onTokenNoteOpen?: (
    tokenStateId: string,
    options?: { mode?: "sheet" | "popover"; anchor?: Konva.Node | null }
  ) => void,
  previewOptions?: MapTokenPreviewOptions
) {
  const userId = useUserId();
  const disabledTokens: Record<string, boolean> = {};
  if (mapState && map) {
    if (!mapState.editFlags.includes("tokens") && map.owner !== userId) {
      for (let token of Object.values(mapState.tokens)) {
        if (token.owner !== userId) {
          disabledTokens[token.id] = true;
        }
      }
    }
  }

  const [isTokenMenuOpen, setIsTokenMenuOpen] = useState<boolean>(false);
  const [tokenMenuOptions, setTokenMenuOptions] = useState<TokenMenuOptions>();
  const [tokenDraggingOptions, setTokenDraggingOptions] =
    useState<TokenDraggingOptions>();
  const [tokenAttributeCountMenu, setTokenAttributeCountMenu] =
    useState<TokenAttributeCountMenuOptions | null>(null);
  const [countInput, setCountInput] = useState("");
  const [countError, setCountError] = useState<string | null>(null);
  const countInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (tokenAttributeCountMenu && countInputRef.current) {
      countInputRef.current.focus();
      countInputRef.current.select();
    }
  }, [tokenAttributeCountMenu]);

  function handleTokenMenuOpen(
    tokenStateId: string,
    tokenImage: Konva.Node,
    focus: boolean
  ) {
    setTokenAttributeCountMenu(null);
    setTokenMenuOptions({ tokenStateId, tokenImage, focus });
    setIsTokenMenuOpen(true);
  }

  function handleTokenMenuClose() {
    setIsTokenMenuOpen(false);
  }

  const handleTokenAttributeCountOpen: TokenAttributeCountOpenEventHandler = (
    request
  ) => {
    const mapElement = document.querySelector(".map");
    if (!mapElement) {
      return;
    }
    const rect = request.node.getClientRect();
    const mapRect = mapElement.getBoundingClientRect();
    const anchorX = mapRect.left + rect.x + rect.width / 2;
    const anchorY = mapRect.top + rect.y;

    let left = anchorX - countMenuWidth / 2;
    let top = anchorY - countMenuHeight - countMenuPadding;
    if (top < countMenuPadding) {
      top = anchorY + rect.height + countMenuPadding;
    }
    left = clamp(
      left,
      countMenuPadding,
      window.innerWidth - countMenuWidth - countMenuPadding
    );
    top = clamp(
      top,
      countMenuPadding,
      window.innerHeight - countMenuHeight - countMenuPadding
    );

    setTokenAttributeCountMenu({
      tokenStateId: request.tokenStateId,
      target: request.target,
      left,
      top,
    });
    setCountInput(`${request.target.current}`);
    setCountError(null);
  };

  function closeTokenAttributeCountMenu() {
    setTokenAttributeCountMenu(null);
    setCountInput("");
    setCountError(null);
  }

  function commitCountInput() {
    if (!tokenAttributeCountMenu || !mapState) {
      closeTokenAttributeCountMenu();
      return;
    }
    const expression = countInput.trim();
    if (!expression) {
      closeTokenAttributeCountMenu();
      return;
    }
    setCountError(null);
    const result = parseNumericExpression(
      tokenAttributeCountMenu.target.current,
      expression
    );
    if (!result.ok) {
      setCountError(result.error);
      return;
    }
    const tokenState = mapState.tokens[tokenAttributeCountMenu.tokenStateId];
    if (!tokenState?.attributes) {
      closeTokenAttributeCountMenu();
      return;
    }
    const nextBars = tokenState.attributes.bars || [];
    const nextValues = tokenState.attributes.values || [];
    if (tokenAttributeCountMenu.target.type === "bar") {
      const index = nextBars.findIndex(
        (bar) => bar.id === tokenAttributeCountMenu.target.id
      );
      if (index < 0) {
        closeTokenAttributeCountMenu();
        return;
      }
      const updatedBars = nextBars.map((bar, idx) =>
        idx === index ? { ...bar, current: result.value } : bar
      );
      const nextAttributes = buildNextAttributes(
        tokenState.attributes,
        updatedBars,
        nextValues,
        userId || "unknown"
      );
      onTokenStateChange({ [tokenState.id]: { attributes: nextAttributes } });
    } else {
      const index = nextValues.findIndex(
        (value) => value.id === tokenAttributeCountMenu.target.id
      );
      if (index < 0) {
        closeTokenAttributeCountMenu();
        return;
      }
      const updatedValues = nextValues.map((value, idx) =>
        idx === index ? { ...value, value: result.value } : value
      );
      const nextAttributes = buildNextAttributes(
        tokenState.attributes,
        nextBars,
        updatedValues,
        userId || "unknown"
      );
      onTokenStateChange({ [tokenState.id]: { attributes: nextAttributes } });
    }

    closeTokenAttributeCountMenu();
  }

  function handleTokenDragStart(
    _: KonvaEventObject<DragEvent>,
    tokenStateId: string,
    attachedTokenStateIds: string[]
  ) {
    if (duplicateToken) {
      let newStates: TokenState[] = [];
      for (let id of [tokenStateId, ...attachedTokenStateIds]) {
        const state = mapState?.tokens[id];
        if (state) {
          newStates.push({ ...state, id: uuid() });
        }
      }
      onTokensStateCreate(newStates);
    }
    setTokenDraggingOptions({
      dragging: true,
      tokenStateId,
      attachedTokenStateIds,
    });
  }

  const enableTokenDragPreview =
    !!previewOptions?.enableTokenDragPreview &&
    typeof previewOptions.onTokenDragMove === "function";

  function handleTokenDragEnd() {
    tokenDraggingOptions &&
      setTokenDraggingOptions({
        ...tokenDraggingOptions,
        dragging: false,
      });
    previewOptions?.onTokenDragPreviewEnd?.();
  }

  function handleTokenStateRemove(tokenStateIds: string[]) {
    onTokenStateRemove(tokenStateIds);
    setTokenDraggingOptions(undefined);
  }

  const [duplicateToken, setDuplicateToken] = useState(false);
  function handleKeyDown(event: KeyboardEvent) {
    if (shortcuts.duplicate(event)) {
      setDuplicateToken(true);
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (shortcuts.duplicate(event)) {
      setDuplicateToken(false);
    }
  }

  function handleBlur() {
    setDuplicateToken(false);
  }

  useKeyboard(handleKeyDown, handleKeyUp);
  useBlur(handleBlur);

  const [transformingTokensIds, setTransformingTokenIds] = useState<string[]>(
    []
  );
  function handleTokenTransformStart(
    event: Konva.KonvaEventObject<Event>,
    attachments: Konva.Node[]
  ) {
    const transformer = event.currentTarget as Konva.Transformer;
    const nodes = transformer.nodes();
    setTransformingTokenIds(
      [...nodes, ...attachments].map((node) => node.id())
    );
  }

  function handleTokenTransformEnd() {
    setTransformingTokenIds([]);
  }

  function tokenFromTokenState(tokenState: TokenState) {
    return (
      map &&
      mapState && (
        <Token
          key={tokenState.id}
          tokenState={tokenState}
          onTokenStateChange={onTokenStateChange}
          onTokenMenuOpen={handleTokenMenuOpen}
          onTokenMenuClose={handleTokenMenuClose}
          onTokenAttributeCountOpen={handleTokenAttributeCountOpen}
          onTokenDragStart={handleTokenDragStart}
          onTokenDragEnd={handleTokenDragEnd}
          onTokenDragMove={
            enableTokenDragPreview ? previewOptions?.onTokenDragMove : undefined
          }
          onTokenTransformStart={handleTokenTransformStart}
          onTokenTransformEnd={handleTokenTransformEnd}
          transforming={transformingTokensIds.includes(tokenState.id)}
          draggable={
            selectedToolId === "move" &&
            !(tokenState.id in disabledTokens) &&
            !tokenState.locked
          }
          selectable={
            selectedToolId === "move" &&
            ((!(tokenState.id in disabledTokens) && !tokenState.locked) ||
              map.owner === userId)
          }
          fadeOnHover={
            tokenState.category !== "prop" && selectedToolId === "drawing"
          }
          map={map}
          mapState={mapState}
          noteModeEnabled={tokenNoteSettings.enabled}
          noteTrigger={tokenNoteSettings.trigger}
          noteLongPressMs={tokenNoteSettings.longPressMs}
          onTokenNoteOpen={onTokenNoteOpen}
          selected={
            !!tokenMenuOptions &&
            isTokenMenuOpen &&
            tokenMenuOptions.tokenStateId === tokenState.id
          }
        />
      )
    );
  }

  const tokens = map && mapState && (
    <Group id="tokens">
      {Object.values(mapState.tokens)
        .filter((tokenState) => tokenState.category !== "prop")
        .sort((a, b) => sortMapTokenStates(a, b, tokenDraggingOptions))
        .map(tokenFromTokenState)}
    </Group>
  );

  const propTokens = map && mapState && (
    <Group id="tokens">
      {Object.values(mapState.tokens)
        .filter((tokenState) => tokenState.category === "prop")
        .sort((a, b) => sortMapTokenStates(a, b, tokenDraggingOptions))
        .map(tokenFromTokenState)}
    </Group>
  );

  const tokenMenu = (
    <TokenMenu
      isOpen={isTokenMenuOpen}
      onRequestClose={handleTokenMenuClose}
      onTokenStateChange={onTokenStateChange}
      tokenState={
        tokenMenuOptions && mapState?.tokens[tokenMenuOptions.tokenStateId]
      }
      focus={tokenMenuOptions?.focus}
      tokenImage={tokenMenuOptions?.tokenImage}
      map={map}
      fogEnabled={mapState?.fogEnabled ?? true}
    />
  );

  const tokenAttributeCountMenuOverlay = tokenAttributeCountMenu ? (
    <MapMenu
      isOpen={true}
      onRequestClose={closeTokenAttributeCountMenu}
      top={tokenAttributeCountMenu.top}
      left={tokenAttributeCountMenu.left}
      style={{ width: `${countMenuWidth}px` }}
    >
      <Box p={2}>
        <Text variant="body2" sx={{ opacity: 0.8, mb: 1 }}>
          {tokenAttributeCountMenu.target.label}
        </Text>
        <Input
          ref={countInputRef}
          value={countInput}
          onChange={(event) => setCountInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitCountInput();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              closeTokenAttributeCountMenu();
            }
          }}
          sx={{ width: "100%", px: 2, py: 1, height: "28px" }}
          placeholder={`${tokenAttributeCountMenu.target.current}`}
          aria-label="Count"
        />
        {countError ? (
          <Text variant="body2" sx={{ color: "red", mt: 1 }}>
            {countError}
          </Text>
        ) : null}
      </Box>
    </MapMenu>
  ) : null;

  const tokenDragOverlay = tokenDraggingOptions && (
    <TokenDragOverlay
      onTokenStateRemove={handleTokenStateRemove}
      draggingOptions={tokenDraggingOptions}
    />
  );

  return {
    tokens,
    propTokens,
    tokenMenu,
    tokenAttributeCountMenu: tokenAttributeCountMenuOverlay,
    tokenDragOverlay,
  };
}

export default useMapTokens;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getMapTokenCategoryWeight(category: TokenCategory) {
  switch (category) {
    case "attachment":
      return 0;
    case "character":
      return 1;
    case "vehicle":
      return 2;
    case "prop":
      return 3;
    default:
      return 0;
  }
}

// Sort so vehicles render below other tokens
function sortMapTokenStates(
  a: TokenState,
  b: TokenState,
  tokenDraggingOptions?: TokenDraggingOptions
) {
  // If categories are different sort in order "prop", "vehicle", "character", "attachment"
  if (b.category !== a.category) {
    const aWeight = getMapTokenCategoryWeight(a.category);
    const bWeight = getMapTokenCategoryWeight(b.category);
    return bWeight - aWeight;
  } else if (
    tokenDraggingOptions &&
    tokenDraggingOptions.dragging &&
    tokenDraggingOptions.tokenStateId === a.id
  ) {
    // If dragging token a move above
    return 1;
  } else if (
    tokenDraggingOptions &&
    tokenDraggingOptions.dragging &&
    tokenDraggingOptions.tokenStateId === b.id
  ) {
    // If dragging token b move above
    return -1;
  } else {
    // Else sort so last modified is on top
    return a.lastModified - b.lastModified;
  }
}
