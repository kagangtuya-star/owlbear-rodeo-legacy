import { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "theme-ui";

import MapControls from "./MapControls";
import MapInteraction from "./MapInteraction";
import MapGrid from "./MapGrid";
import FogOfWarLayer from "./FogOfWarLayer";

import DrawingTool from "../tools/DrawingTool";
import WallTool from "../tools/WallTool";
import MeasureTool from "../tools/MeasureTool";
import SpellTemplateTool from "../tools/SpellTemplateTool";
import NetworkedMapPointer from "../../network/NetworkedMapPointer";

import { useSettings } from "../../contexts/SettingsContext";
import { useUserId } from "../../contexts/UserIdContext";

import Action from "../../actions/Action";
import {
  AddStatesAction,
  EditStatesAction,
  RemoveStatesAction,
} from "../../actions";

import Session from "../../network/Session";

import { Drawing, DrawingState } from "../../types/Drawing";
import { Wall, WallState } from "../../types/Wall";
import { Map as MapType, MapToolId } from "../../types/Map";
import { MapState } from "../../types/MapState";
import { Settings } from "../../types/Settings";
import { SpellTemplate, SpellTemplateState } from "../../types/SpellTemplate";
import RemoveTokenIcon from "../../icons/RemoveTokenIcon";
import {
  MapChangeEventHandler,
  MapResetEventHandler,
  MapStateSettingsChangeEventHandler,
  TokenStateRemoveHandler,
  NoteChangeEventHandler,
  NoteRemoveEventHander,
  TokenStateChangeEventHandler,
  NoteCreateEventHander,
  TokenNoteChangeEventHandler,
  TokenNoteCreateEventHandler,
  TokenNoteRemoveEventHandler,
  SelectionItemsChangeEventHandler,
  SelectionItemsRemoveEventHandler,
  SelectionItemsCreateEventHandler,
  TokensStateCreateHandler,
} from "../../types/Events";

import useMapTokens from "../../hooks/useMapTokens";
import useMapNotes from "../../hooks/useMapNotes";
import { MapActions } from "../../hooks/useMapActions";
import useMapSelection from "../../hooks/useMapSelection";
import useTokenNotes from "../../hooks/useTokenNotes";

type MapProps = {
  map: MapType | null;
  mapState: MapState | null;
  mapActions: MapActions;
  onMapTokenStateChange: TokenStateChangeEventHandler;
  onMapTokenStateRemove: TokenStateRemoveHandler;
  onMapTokensStateCreate: TokensStateCreateHandler;
  onSelectionItemsChange: SelectionItemsChangeEventHandler;
  onSelectionItemsRemove: SelectionItemsRemoveEventHandler;
  onSelectionItemsCreate: SelectionItemsCreateEventHandler;
  onMapChange: MapChangeEventHandler;
  onMapReset: MapResetEventHandler;
  onMapStateChange: MapStateSettingsChangeEventHandler;
  onMapDraw: (action: Action<DrawingState>) => void;
  onWallDraw: (action: Action<WallState>) => void;
  onMapTemplateDraw: (action: Action<SpellTemplateState>) => void;
  onMapNoteCreate: NoteCreateEventHander;
  onMapNoteChange: NoteChangeEventHandler;
  onMapNoteRemove: NoteRemoveEventHander;
  onMapTokenNoteCreate: TokenNoteCreateEventHandler;
  onMapTokenNoteChange: TokenNoteChangeEventHandler;
  onMapTokenNoteRemove: TokenNoteRemoveEventHandler;
  allowMapChange: boolean;
  session: Session;
  onUndo: () => void;
  onRedo: () => void;
};

function Map({
  map,
  mapState,
  mapActions,
  onMapTokenStateChange,
  onMapTokenStateRemove,
  onMapTokensStateCreate,
  onSelectionItemsChange,
  onSelectionItemsRemove,
  onSelectionItemsCreate,
  onMapChange,
  onMapReset,
  onMapStateChange,
  onMapDraw,
  onWallDraw,
  onMapTemplateDraw,
  onMapNoteCreate,
  onMapNoteChange,
  onMapNoteRemove,
  onMapTokenNoteCreate,
  onMapTokenNoteChange,
  onMapTokenNoteRemove,
  allowMapChange,
  session,
  onUndo,
  onRedo,
}: MapProps) {
  const userId = useUserId();

  const [selectedToolId, setSelectedToolId] = useState<MapToolId>("move");
  const { settings, setSettings } = useSettings();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [isTemplateDragging, setIsTemplateDragging] = useState(false);
  const templateTrashRef = useRef<HTMLDivElement | null>(null);

  const [tokenDragPreview, setTokenDragPreview] = useState<
    Record<string, { x: number; y: number }> | null
  >(null);
  const tokenDragPreviewEnabled = !!settings.fog?.previewOnDrag;
  const tokenDragPreviewActive =
    tokenDragPreviewEnabled &&
    !!tokenDragPreview &&
    Object.keys(tokenDragPreview).length > 0;

  useEffect(() => {
    if (!tokenDragPreviewEnabled && tokenDragPreview) {
      setTokenDragPreview(null);
    }
  }, [tokenDragPreviewEnabled, tokenDragPreview]);

  const handleTokenDragPreviewChange = useCallback(
    (updates: Record<string, { x: number; y: number }>) => {
      if (!tokenDragPreviewEnabled) {
        return;
      }
      setTokenDragPreview(updates);
    },
    [tokenDragPreviewEnabled]
  );

  const handleTokenDragPreviewEnd = useCallback(() => {
    if (!tokenDragPreviewEnabled) {
      return;
    }
    setTokenDragPreview(null);
  }, [tokenDragPreviewEnabled]);

  function handleToolSettingChange(change: Partial<Settings>) {
    setSettings((prevSettings) => ({
      ...prevSettings,
      ...change,
    }));
  }

  const drawShapes = Object.values(mapState?.drawings || {});
  const wallShapes = Object.values(mapState?.walls || {});
  const templateShapes = Object.values(mapState?.templates || {});
  const templateTokens = Object.values(mapState?.tokens || {});

  function handleToolAction(action: string) {
    if (action === "eraseAll") {
      if (selectedToolId === "drawing") {
        onMapDraw(new RemoveStatesAction(drawShapes.map((s) => s.id)));
      } else if (selectedToolId === "fog") {
        onWallDraw(new RemoveStatesAction(wallShapes.map((s) => s.id)));
      }
    } else if (action === "toggleFogEnabled") {
      onMapStateChange({ fogEnabled: !(mapState?.fogEnabled ?? true) });
    } else if (action === "toggleExplored") {
      onMapStateChange({ showExplored: !(mapState?.showExplored ?? false) });
    } else if (action === "resetExplored") {
      onMapStateChange({ explored: [] });
    } else if (action.startsWith("setGmOpacity:")) {
      const rawValue = parseFloat(action.split(":")[1]);
      const nextValue = Number.isFinite(rawValue)
        ? Math.min(Math.max(rawValue, 0), 1)
        : 0.35;
      setSettings((prevSettings) => ({
        ...prevSettings,
        fog: {
          ...prevSettings.fog,
          gmOpacity: nextValue,
        },
      }));
    }
  }

  function handleMapShapeAdd(shape: Drawing) {
    onMapDraw(new AddStatesAction([shape]));
  }

  function handleMapShapesRemove(shapeIds: string[]) {
    onMapDraw(new RemoveStatesAction(shapeIds));
  }

  function handleMapShapesEdit(shapes: Partial<Drawing>[]) {
    onMapDraw(new EditStatesAction(shapes));
  }

  function handleWallAdd(shapes: Wall[]) {
    onWallDraw(new AddStatesAction(shapes));
  }

  function handleWallRemove(shapeIds: string[]) {
    onWallDraw(new RemoveStatesAction(shapeIds));
  }


  function handleTemplateAdd(template: SpellTemplate) {
    onMapTemplateDraw(new AddStatesAction([template]));
  }

  function handleTemplateEdit(edits: Partial<SpellTemplate>[]) {
    onMapTemplateDraw(new EditStatesAction(edits));
  }

  function handleTemplateRemove(templateIds: string[]) {
    onMapTemplateDraw(new RemoveStatesAction(templateIds));
  }

  function handleRemoveSelectedTemplate() {
    if (!selectedTemplateId) {
      return;
    }
    handleTemplateRemove([selectedTemplateId]);
    setSelectedTemplateId(null);
  }

  function handleRemoveAllTemplates() {
    if (templateShapes.length === 0) {
      return;
    }
    handleTemplateRemove(templateShapes.map((template) => template.id));
    setSelectedTemplateId(null);
  }

  function isPointOverTemplateTrash(clientX: number, clientY: number) {
    const trash = templateTrashRef.current;
    if (!trash) {
      return false;
    }
    const rect = trash.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  const { tokenNoteSheet, tokenNotePopover, openTokenNote } = useTokenNotes(
    map,
    mapState,
    onMapTokenNoteCreate,
    onMapTokenNoteChange,
    onMapTokenNoteRemove,
    settings.tokenNote
  );

  const { tokens, propTokens, tokenMenu, tokenDragOverlay } = useMapTokens(
    map,
    mapState,
    onMapTokenStateChange,
    onMapTokenStateRemove,
    onMapTokensStateCreate,
    selectedToolId,
    settings.tokenNote,
    openTokenNote,
    {
      enableTokenDragPreview: tokenDragPreviewEnabled,
      onTokenDragMove: handleTokenDragPreviewChange,
      onTokenDragPreviewEnd: handleTokenDragPreviewEnd,
    }
  );

  const { notes, noteMenu, noteHud, noteTextOverlay, noteDragOverlay } =
    useMapNotes(
      map,
      mapState,
      onMapNoteCreate,
      onMapNoteChange,
      onMapNoteRemove,
      selectedToolId
    );

  const { selectionTool, selectionMenu, selectionDragOverlay } =
    useMapSelection(
      map,
      mapState,
      onSelectionItemsChange,
      onSelectionItemsRemove,
      onSelectionItemsCreate,
      selectedToolId,
      settings.select
    );

  return (
    <Box sx={{ flexGrow: 1 }}>
      <MapInteraction
        map={map}
        mapState={mapState}
        overlay={
          <FogOfWarLayer
            map={map}
            mapState={mapState}
            fogSettings={settings.fog}
            onExploredChange={
              tokenDragPreviewActive
                ? undefined
                : (explored) => onMapStateChange({ explored })
            }
            tokenPreview={
              tokenDragPreviewActive ? tokenDragPreview ?? undefined : undefined
            }
            useTokenPreview={tokenDragPreviewEnabled}
          />
        }
        controls={
          <>
            <MapControls
              onMapChange={onMapChange}
              onMapReset={onMapReset}
              map={map}
              mapState={mapState}
              mapActions={mapActions}
              allowMapChange={allowMapChange}
              onSelectedToolChange={setSelectedToolId}
              selectedToolId={selectedToolId}
              toolSettings={settings}
              onToolSettingChange={handleToolSettingChange}
              onToolAction={handleToolAction}
              selectedTemplateId={selectedTemplateId}
              onRemoveSelectedTemplate={handleRemoveSelectedTemplate}
              hasTemplates={templateShapes.length > 0}
              onRemoveAllTemplates={handleRemoveAllTemplates}
              onUndo={onUndo}
              onRedo={onRedo}
            />
            {selectedToolId === "spellTemplates" && isTemplateDragging && (
              <Box
                ref={templateTrashRef}
                sx={{
                  position: "absolute",
                  left: "50%",
                  bottom: "12px",
                  transform: "translateX(-50%)",
                  backgroundColor: "overlay",
                  borderRadius: "999px",
                  padding: "8px",
                  pointerEvents: "none",
                }}
              >
                <RemoveTokenIcon />
              </Box>
            )}
            {tokenMenu}
            {noteMenu}
            {noteHud}
            {noteTextOverlay}
            {selectionMenu}
            {tokenNotePopover}
            {tokenNoteSheet}
            {tokenDragOverlay}
            {noteDragOverlay}
            {selectionDragOverlay}
          </>
        }
        selectedToolId={selectedToolId}
        onSelectedToolChange={setSelectedToolId}
      >
        {map && map.showGrid && <MapGrid map={map} />}
        {propTokens}
        <DrawingTool
          map={map}
          drawings={drawShapes}
          onDrawingAdd={handleMapShapeAdd}
          onDrawingsRemove={handleMapShapesRemove}
          onDrawingsEdit={handleMapShapesEdit}
          active={selectedToolId === "drawing"}
          toolSettings={settings.drawing}
        />
        <SpellTemplateTool
          map={map}
          templates={templateShapes}
          active={selectedToolId === "spellTemplates"}
          toolSettings={settings.spellTemplates}
          onTemplateAdd={handleTemplateAdd}
          onTemplateEdit={handleTemplateEdit}
          selectedTemplateId={selectedTemplateId}
          onSelectedTemplateIdChange={setSelectedTemplateId}
          onRemoveSelectedTemplate={handleRemoveSelectedTemplate}
          onTemplateDragStateChange={setIsTemplateDragging}
          isPointOverTrash={isPointOverTemplateTrash}
          tokens={templateTokens}
          editable={
            !!(map?.owner === userId || mapState?.editFlags.includes("drawing"))
          }
        />
        {notes}
        {tokens}
        <WallTool
          map={map}
          walls={wallShapes}
          onWallsAdd={handleWallAdd}
          onWallsRemove={handleWallRemove}
          active={selectedToolId === "fog"}
          toolSettings={settings.fog}
          editable={
            !!(map?.owner === userId || mapState?.editFlags.includes("fog")) &&
            !settings.fog.preview
          }
        />
        <NetworkedMapPointer
          active={selectedToolId === "pointer"}
          session={session}
        />
        <MeasureTool map={map} active={selectedToolId === "measure"} />
        {selectionTool}
      </MapInteraction>
    </Box>
  );
}

export default Map;
