import { useRef, useState } from "react";
import { Box } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import MapControls from "./MapControls";
import MapInteraction from "./MapInteraction";
import MapGrid from "./MapGrid";

import DrawingTool from "../tools/DrawingTool";
import FogTool from "../tools/FogTool";
import MeasureTool from "../tools/MeasureTool";
import SpellTemplateTool from "../tools/SpellTemplateTool";
import NetworkedMapPointer from "../../network/NetworkedMapPointer";

import { useSettings } from "../../contexts/SettingsContext";
import { useUserId } from "../../contexts/UserIdContext";

import Action from "../../actions/Action";
import {
  AddStatesAction,
  CutFogAction,
  EditStatesAction,
  RemoveStatesAction,
} from "../../actions";

import Session from "../../network/Session";

import { Drawing, DrawingState } from "../../types/Drawing";
import { Fog, FogState } from "../../types/Fog";
import { Map as MapType, MapToolId } from "../../types/Map";
import { MapState } from "../../types/MapState";
import { Settings } from "../../types/Settings";
import { SpellTemplate, SpellTemplateState } from "../../types/SpellTemplate";
import RemoveTokenIcon from "../../icons/RemoveTokenIcon";
import {
  MapChangeEventHandler,
  MapResetEventHandler,
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
  onMapDraw: (action: Action<DrawingState>) => void;
  onFogDraw: (action: Action<FogState>) => void;
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
  onMapDraw,
  onFogDraw,
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
  const { addToast } = useToasts();

  const userId = useUserId();

  const [selectedToolId, setSelectedToolId] = useState<MapToolId>("move");
  const { settings, setSettings } = useSettings();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [isTemplateDragging, setIsTemplateDragging] = useState(false);
  const templateTrashRef = useRef<HTMLDivElement | null>(null);

  function handleToolSettingChange(change: Partial<Settings>) {
    setSettings((prevSettings) => ({
      ...prevSettings,
      ...change,
    }));
  }

  const drawShapes = Object.values(mapState?.drawings || {});
  const fogShapes = Object.values(mapState?.fogs || {});
  const templateShapes = Object.values(mapState?.templates || {});
  const templateTokens = Object.values(mapState?.tokens || {});

  function handleToolAction(action: string) {
    if (action === "eraseAll") {
      onMapDraw(new RemoveStatesAction(drawShapes.map((s) => s.id)));
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

  function handleFogShapesAdd(shapes: Fog[]) {
    onFogDraw(new AddStatesAction(shapes));
  }

  function handleFogShapesCut(shapes: Fog[]) {
    onFogDraw(new CutFogAction(shapes));
  }

  function handleFogShapesRemove(shapeIds: string[]) {
    onFogDraw(new RemoveStatesAction(shapeIds));
  }

  function handleFogShapesEdit(shapes: Partial<Fog>[]) {
    onFogDraw(new EditStatesAction(shapes));
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
    openTokenNote
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
        <FogTool
          map={map}
          shapes={fogShapes}
          onShapesAdd={handleFogShapesAdd}
          onShapesCut={handleFogShapesCut}
          onShapesRemove={handleFogShapesRemove}
          onShapesEdit={handleFogShapesEdit}
          onShapeError={addToast}
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
