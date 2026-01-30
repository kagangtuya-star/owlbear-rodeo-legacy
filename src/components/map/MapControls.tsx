import { useState, Fragment, useEffect, useMemo } from "react";
import { IconButton, Flex, Box } from "theme-ui";

import RadioIconButton from "../RadioIconButton";
import Divider from "../Divider";

import SelectMapButton from "./SelectMapButton";

import FogToolSettings from "../controls/FogToolSettings";
import DrawingToolSettings from "../controls/DrawingToolSettings";
import SpellTemplateToolSettings from "../controls/SpellTemplateToolSettings";
import PointerToolSettings from "../controls/PointerToolSettings";
import SelectToolSettings from "../controls/SelectToolSettings";

import MoveToolIcon from "../../icons/MoveToolIcon";
import FogToolIcon from "../../icons/FogToolIcon";
import BrushToolIcon from "../../icons/BrushToolIcon";
import MeasureToolIcon from "../../icons/MeasureToolIcon";
import ExpandMoreIcon from "../../icons/ExpandMoreIcon";
import PointerToolIcon from "../../icons/PointerToolIcon";
import FullScreenIcon from "../../icons/FullScreenIcon";
import FullScreenExitIcon from "../../icons/FullScreenExitIcon";
import NoteToolIcon from "../../icons/NoteToolIcon";
import TextToolIcon from "../../icons/NoteTextIcon";
import SelectToolIcon from "../../icons/SelectToolIcon";
import PasteIcon from "../../icons/PasteIcon";
import SpellTemplateToolIcon from "../../icons/SpellTemplateToolIcon";

import UndoButton from "../controls/shared/UndoButton";
import RedoButton from "../controls/shared/RedoButton";

import useSetting from "../../hooks/useSetting";

import { Map, MapTool, MapToolId } from "../../types/Map";
import { MapState } from "../../types/MapState";
import {
  MapChangeEventHandler,
  MapResetEventHandler,
} from "../../types/Events";
import { Settings } from "../../types/Settings";
import type { SpellTemplateToolSettings as SpellTemplateToolSettingsType } from "../../types/SpellTemplate";

import { useKeyboard } from "../../contexts/KeyboardContext";
import { useImageImport } from "../../contexts/ImageImportContext";

import shortcuts from "../../shortcuts";
import { useUserId } from "../../contexts/UserIdContext";
import { isEmpty } from "../../helpers/shared";
import { MapActions } from "../../hooks/useMapActions";

type MapControlsProps = {
  onMapChange: MapChangeEventHandler;
  onMapReset: MapResetEventHandler;
  map: Map | null;
  mapState: MapState | null;
  mapActions: MapActions;
  allowMapChange: boolean;
  selectedToolId: MapToolId;
  onSelectedToolChange: (toolId: MapToolId) => void;
  toolSettings: Settings;
  onToolSettingChange: (change: Partial<Settings>) => void;
  onToolAction: (actionId: string) => void;
  selectedTemplateId: string | null;
  onRemoveSelectedTemplate: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

function MapContols({
  onMapChange,
  onMapReset,
  map,
  mapState,
  mapActions,
  allowMapChange,
  selectedToolId,
  onSelectedToolChange,
  toolSettings,
  onToolSettingChange,
  onToolAction,
  selectedTemplateId,
  onRemoveSelectedTemplate,
  onUndo,
  onRedo,
}: MapControlsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [fullScreen, setFullScreen] = useSetting("map.fullScreen");

  const userId = useUserId();
  const imageImport = useImageImport();
  const tokenNoteSettings = toolSettings.tokenNote || {
    enabled: false,
    trigger: "longPress",
    longPressMs: 500,
    blur: "high",
    fontSize: "md",
    defaultFont: "default",
    defaultPermission: "write",
  };
  const tokenNoteEnabled = tokenNoteSettings.enabled;

  const disabledControls = useMemo(() => {
    const isOwner = map && map.owner === userId;
    const allowMapDrawing = isOwner || mapState?.editFlags.includes("drawing");
    const allowFogDrawing = isOwner || mapState?.editFlags.includes("fog");
    const allowNoteEditing = isOwner || mapState?.editFlags.includes("notes");

    const disabled: MapToolId[] = [];
    if (!allowMapChange) {
      disabled.push("map");
    }
    if (!map) {
      disabled.push("move");
      disabled.push("measure");
      disabled.push("pointer");
      disabled.push("select");
    }
    if (!map || !allowMapDrawing) {
      disabled.push("drawing");
      disabled.push("spellTemplates");
    }
    if (!map || !allowFogDrawing) {
      disabled.push("fog");
    }
    if (!map || !allowNoteEditing) {
      disabled.push("note");
      disabled.push("text");
    }
    if (!map || mapActions.actionIndex < 0) {
      disabled.push("undo");
    }
    if (!map || mapActions.actionIndex === mapActions.actions.length - 1) {
      disabled.push("redo");
    }
    return disabled;
  }, [map, mapState, mapActions, allowMapChange, userId]);

  // Change back to move tool if selected tool becomes disabled
  useEffect(() => {
    if (disabledControls.includes(selectedToolId)) {
      onSelectedToolChange("move");
    }
  }, [selectedToolId, disabledControls, onSelectedToolChange]);

  const disabledSettings = useMemo(() => {
    const disabled: Partial<Record<keyof Settings, string[]>> = {
      drawing: [],
    };
    if (mapState && isEmpty(mapState.drawings)) {
      disabled.drawing?.push("erase");
    }
    return disabled;
  }, [mapState]);

  const defaultSpellTemplateSettings: SpellTemplateToolSettingsType = {
    type: "circle",
    rule: "center",
    color: "red",
    opacity: 0.5,
    strokeWidth: 1,
    lineWidth: 1,
    coneAngle: 90,
    ringInnerRatio: 0.5,
    previewOnRotate: true,
  };

  const toolsById: Record<string, MapTool> = {
    move: {
      id: "move",
      icon: <MoveToolIcon />,
      title: "Move Tool (W)",
    },
    select: {
      id: "select",
      icon: <SelectToolIcon />,
      title: "Select Tool (S)",
      SettingsComponent: SelectToolSettings,
    },
    fog: {
      id: "fog",
      icon: <FogToolIcon />,
      title: "Fog Tool (F)",
      SettingsComponent: FogToolSettings,
    },
    drawing: {
      id: "drawing",
      icon: <BrushToolIcon />,
      title: "Drawing Tool (D)",
      SettingsComponent: DrawingToolSettings,
    },
    spellTemplates: {
      id: "spellTemplates",
      icon: <SpellTemplateToolIcon />,
      title: "Spell Templates (A)",
      SettingsComponent: SpellTemplateToolSettings,
    },
    measure: {
      id: "measure",
      icon: <MeasureToolIcon />,
      title: "Measure Tool (M)",
    },
    pointer: {
      id: "pointer",
      icon: <PointerToolIcon />,
      title: "Pointer Tool (Q)",
      SettingsComponent: PointerToolSettings,
    },
    text: {
      id: "text",
      icon: <TextToolIcon />,
      title: "Text Tool (X)",
    },
    note: {
      id: "note",
      icon: <NoteToolIcon />,
      title: "Note Tool (N)",
    },
  };
  const tools: MapToolId[] = [
    "move",
    "select",
    "fog",
    "drawing",
    "spellTemplates",
    "measure",
    "pointer",
    "text",
    "note",
  ];

  const sections = [
    {
      id: "map",
      component: (
        <SelectMapButton
          onMapChange={onMapChange}
          onMapReset={onMapReset}
          currentMap={map}
          currentMapState={mapState}
          disabled={disabledControls.includes("map")}
        />
      ),
    },
    ...(imageImport?.openImportFromUrl
      ? [
          {
            id: "import",
            component: (
              <IconButton
                aria-label="通过 URL 导入"
                title="通过 URL 导入"
                onClick={imageImport.openImportFromUrl}
              >
                <PasteIcon />
              </IconButton>
            ),
          },
        ]
      : []),
    {
      id: "tools",
      component: tools.map((tool) => (
        <RadioIconButton
          key={tool}
          title={toolsById[tool].title}
          onClick={() => onSelectedToolChange(tool)}
          isSelected={selectedToolId === tool}
          disabled={disabledControls.includes(tool)}
        >
          {toolsById[tool].icon}
        </RadioIconButton>
      )),
    },
    {
      id: "tokenNotes",
      component: (
        <IconButton
          aria-label="Token Note Mode"
          title="Token Note Mode"
          onClick={() =>
            onToolSettingChange({
              tokenNote: {
                ...tokenNoteSettings,
                enabled: !tokenNoteEnabled,
              },
            })
          }
          disabled={!map}
          sx={{
            backgroundColor: tokenNoteEnabled ? "highlight" : "transparent",
          }}
        >
          <NoteToolIcon />
        </IconButton>
      ),
    },
    {
      id: "history",
      component: (
        <>
          <UndoButton
            onClick={onUndo}
            disabled={disabledControls.includes("undo")}
          />
          <RedoButton
            onClick={onRedo}
            disabled={disabledControls.includes("redo")}
          />
        </>
      ),
    },
  ];

  let controls = null;
  if (sections.length === 1 && sections[0].id === "map") {
    controls = (
      <Box
        sx={{
          display: "block",
          backgroundColor: "overlay",
          borderRadius: "4px",
        }}
        m={2}
      >
        {sections[0].component}
      </Box>
    );
  } else if (sections.length > 0) {
    controls = (
      <>
        <IconButton
          aria-label={isExpanded ? "Hide Map Controls" : "Show Map Controls"}
          title={isExpanded ? "Hide Map Controls" : "Show Map Controls"}
          onClick={() => setIsExpanded(!isExpanded)}
          sx={{
            transform: `rotate(${isExpanded ? "0" : "180deg"})`,
            display: "block",
            backgroundColor: "overlay",
            borderRadius: "50%",
          }}
          m={2}
        >
          <ExpandMoreIcon />
        </IconButton>
        <Box
          sx={{
            flexDirection: "column",
            alignItems: "center",
            display: isExpanded ? "flex" : "none",
            backgroundColor: "overlay",
            borderRadius: "4px",
          }}
          p={2}
        >
          {sections.map((section, index) => (
            <Fragment key={section.id}>
              {section.component}
              {index !== sections.length - 1 && <Divider />}
            </Fragment>
          ))}
        </Box>
      </>
    );
  }

  function getToolSettings() {
    const Settings = toolsById[selectedToolId].SettingsComponent;
    if (
      !Settings ||
      (selectedToolId !== "fog" &&
        selectedToolId !== "drawing" &&
        selectedToolId !== "spellTemplates" &&
        selectedToolId !== "pointer" &&
        selectedToolId !== "select")
    ) {
      return null;
    }
    const selectedSettings =
      selectedToolId === "spellTemplates" && !toolSettings.spellTemplates
        ? defaultSpellTemplateSettings
        : toolSettings[selectedToolId];
    return (
      <Box
        sx={{
          position: "absolute",
          top: "4px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "overlay",
          borderRadius: "4px",
          maxWidth: "calc(100% - 16px)",
          overflowX: "auto",
        }}
        p={1}
      >
        <Settings
          settings={selectedSettings}
          onSettingChange={(
            change: Partial<
              Settings["fog" | "drawing" | "spellTemplates" | "pointer" | "select"]
            >
          ) =>
            onToolSettingChange({
              [selectedToolId]: {
                ...selectedSettings,
                ...change,
              },
            })
          }
          onToolAction={onToolAction}
          disabledActions={disabledSettings[selectedToolId]}
          selectedTemplateId={
            selectedToolId === "spellTemplates" ? selectedTemplateId : null
          }
          onRemoveSelectedTemplate={
            selectedToolId === "spellTemplates" ? onRemoveSelectedTemplate : null
          }
        />
      </Box>
    );
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (shortcuts.moveTool(event) && !disabledControls.includes("move")) {
      onSelectedToolChange("move");
    }
    if (shortcuts.selectTool(event) && !disabledControls.includes("select")) {
      onSelectedToolChange("select");
    }
    if (shortcuts.drawingTool(event) && !disabledControls.includes("drawing")) {
      onSelectedToolChange("drawing");
    }
    if (
      shortcuts.spellTemplateTool(event) &&
      !disabledControls.includes("spellTemplates")
    ) {
      onSelectedToolChange("spellTemplates");
    }
    if (shortcuts.fogTool(event) && !disabledControls.includes("fog")) {
      onSelectedToolChange("fog");
    }
    if (shortcuts.measureTool(event) && !disabledControls.includes("measure")) {
      onSelectedToolChange("measure");
    }
    if (shortcuts.pointerTool(event) && !disabledControls.includes("pointer")) {
      onSelectedToolChange("pointer");
    }
    if (shortcuts.textTool(event) && !disabledControls.includes("text")) {
      onSelectedToolChange("text");
    }
    if (shortcuts.noteTool(event) && !disabledControls.includes("note")) {
      onSelectedToolChange("note");
    }
    if (shortcuts.redo(event) && !disabledControls.includes("redo")) {
      onRedo();
    }
    if (shortcuts.undo(event) && !disabledControls.includes("undo")) {
      onUndo();
    }
  }

  useKeyboard(handleKeyDown);

  return (
    <>
      <Flex
        sx={{
          position: "absolute",
          top: 0,
          right: 0,
          flexDirection: "column",
          alignItems: "center",
        }}
        mx={1}
      >
        {controls}
      </Flex>
      {getToolSettings()}
      <Box
        sx={{
          position: "absolute",
          right: "4px",
          bottom: 0,
          backgroundColor: "overlay",
          borderRadius: "50%",
        }}
        m={2}
      >
        <IconButton
          onClick={() => setFullScreen(!fullScreen)}
          aria-label={fullScreen ? "Exit Full Screen" : "Enter Full Screen"}
          title={fullScreen ? "Exit Full Screen" : "Enter Full Screen"}
        >
          {fullScreen ? <FullScreenExitIcon /> : <FullScreenIcon />}
        </IconButton>
      </Box>
    </>
  );
}

export default MapContols;
