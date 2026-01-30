import { Flex, Text } from "theme-ui";
import { useMedia } from "react-media";

import RadioIconButton from "../RadioIconButton";

import FogBrushIcon from "../../icons/FogBrushIcon";
import FogPolygonIcon from "../../icons/FogPolygonIcon";
import FogRemoveIcon from "../../icons/FogRemoveIcon";
import FogRectangleIcon from "../../icons/FogRectangleIcon";
import FogToggleIcon from "../../icons/FogToggleIcon";
import FogCutOnIcon from "../../icons/FogCutOnIcon";
import FogCutOffIcon from "../../icons/FogCutOffIcon";

import ToolSection from "./shared/ToolSection";

import Divider from "../Divider";
import EraseAllButton from "./shared/EraseAllButton";
import Slider from "../Slider";

import { useKeyboard } from "../../contexts/KeyboardContext";

import shortcuts from "../../shortcuts";

import {
  FogToolSettings as FogToolSettingsType,
  FogToolType,
} from "../../types/Fog";

type FogToolSettingsProps = {
  settings: FogToolSettingsType;
  onSettingChange: (change: Partial<FogToolSettingsType>) => void;
  onToolAction?: (action: string) => void;
  disabledActions?: string[];
  fogEnabled?: boolean;
  showGmOpacity?: boolean;
  gmOpacity?: number;
};

function FogToolSettings({
  settings,
  onSettingChange,
  onToolAction,
  disabledActions = [],
  fogEnabled = true,
  showGmOpacity = false,
  gmOpacity = 0.35,
}: FogToolSettingsProps) {
  const showExplored = !!settings.showExplored;
  // Keyboard shortcuts
  function handleKeyDown(event: KeyboardEvent) {
    if (shortcuts.fogPolygon(event)) {
      onSettingChange({ type: "polygon" });
    } else if (shortcuts.fogBrush(event)) {
      onSettingChange({ type: "brush" });
    } else if (shortcuts.fogErase(event)) {
      onSettingChange({ type: "remove" });
    } else if (shortcuts.fogRectangle(event)) {
      onSettingChange({ type: "rectangle" });
    }
  }

  useKeyboard(handleKeyDown);

  const isSmallScreen = useMedia({ query: "(max-width: 799px)" });
  const drawTools = [
    {
      id: "polygon",
      title: "Wall Pen (P)",
      isSelected: settings.type === "polygon",
      icon: <FogPolygonIcon />,
    },
    {
      id: "rectangle",
      title: "Wall Line (R)",
      isSelected: settings.type === "rectangle",
      icon: <FogRectangleIcon />,
    },
    {
      id: "brush",
      title: "Wall Brush (B)",
      isSelected: settings.type === "brush",
      icon: <FogBrushIcon />,
    },
  ];

  return (
    <Flex sx={{ alignItems: "center" }}>
      <RadioIconButton
        title={fogEnabled ? "Disable Fog" : "Enable Fog"}
        onClick={() => onToolAction?.("toggleFogEnabled")}
        isSelected={fogEnabled}
      >
        <FogToggleIcon />
      </RadioIconButton>
      <Divider vertical />
      <RadioIconButton
        title={showExplored ? "Hide Explored" : "Show Explored"}
        onClick={() => onSettingChange({ showExplored: !showExplored })}
        isSelected={showExplored}
      >
        {showExplored ? <FogCutOnIcon /> : <FogCutOffIcon />}
      </RadioIconButton>
      {showGmOpacity && (
        <>
          <Divider vertical />
          <Flex sx={{ alignItems: "center" }}>
            <Text variant="body2" sx={{ mr: 2 }}>
              GM Fog
            </Text>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={gmOpacity}
              onChange={(e) =>
                onToolAction?.(
                  `setGmOpacity:${parseFloat(e.target.value) || 0}`
                )
              }
              labelFunc={(value) => `${Math.round(value * 100)}%`}
              ml={2}
              mr={3}
            />
          </Flex>
        </>
      )}
      <Divider vertical />
      <ToolSection
        tools={drawTools}
        onToolClick={(tool) =>
          onSettingChange({ type: tool.id as FogToolType })
        }
        collapse={isSmallScreen}
      />
      <Divider vertical />
      <RadioIconButton
        title="Erase Wall (E)"
        onClick={() => onSettingChange({ type: "remove" })}
        isSelected={settings.type === "remove"}
      >
        <FogRemoveIcon />
      </RadioIconButton>
      <Divider vertical />
      <EraseAllButton
        onToolAction={onToolAction || (() => {})}
        disabled={disabledActions.includes("eraseAll")}
      />
    </Flex>
  );
}

export default FogToolSettings;
