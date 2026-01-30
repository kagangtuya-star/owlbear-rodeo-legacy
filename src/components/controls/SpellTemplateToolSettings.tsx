import { MouseEventHandler, useState } from "react";
import type { MouseEvent } from "react";
import { Box, Flex, Input, Label, SxProp, IconButton } from "theme-ui";
import { useMedia } from "react-media";

import ToolSection from "./shared/ToolSection";
import Divider from "../Divider";
import Select from "../Select";
import MapMenu from "../map/MapMenu";

import BrushRectangleIcon from "../../icons/BrushRectangleIcon";
import BrushCircleIcon from "../../icons/BrushCircleIcon";
import BrushLineIcon from "../../icons/BrushLineIcon";
import BrushTriangleIcon from "../../icons/BrushTriangleIcon";
import FogPreviewOffIcon from "../../icons/FogPreviewOffIcon";
import FogPreviewOnIcon from "../../icons/FogPreviewOnIcon";
import SettingsIcon from "../../icons/SettingsIcon";

import colors, { colorOptions, Color } from "../../helpers/colors";

import {
  SpellTemplateRule,
  SpellTemplateToolSettings as SpellTemplateToolSettingsType,
  SpellTemplateType,
} from "../../types/SpellTemplate";

type SpellTemplateToolSettingsProps = {
  settings: SpellTemplateToolSettingsType;
  onSettingChange: (change: Partial<SpellTemplateToolSettingsType>) => void;
};

type RuleOption = { value: SpellTemplateRule; label: string };

const ruleOptions: RuleOption[] = [
  { value: "center", label: "Center Point" },
  { value: "area_50", label: "Area >= 50%" },
  { value: "touch", label: "Touch" },
  { value: "ruleset_dnd5e", label: "D&D 5e" },
  { value: "ruleset_pf", label: "Pathfinder" },
];

type ColorCircleProps = {
  color: string;
  selected: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
} & SxProp;
function ColorCircle({ color, selected, onClick, sx }: ColorCircleProps) {
  return (
    <Box
      sx={{
        borderRadius: "50%",
        transform: "scale(0.75)",
        backgroundColor: color,
        cursor: "pointer",
        position: "relative",
        ...sx,
      }}
      onClick={onClick}
      aria-label={`Template Color ${color}`}
    >
      {selected && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            border: "2px solid white",
            position: "absolute",
            top: 0,
            borderRadius: "50%",
          }}
        />
      )}
    </Box>
  );
}

type ColorControlProps = {
  color: string;
  onColorChange: (newColor: string) => void;
};

function SpellTemplateColorControl({
  color,
  onColorChange,
}: ColorControlProps) {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [colorMenuOptions, setColorMenuOptions] = useState({});

  const palette = colorOptions.filter((c) => c !== "primary");
  const paletteColor = colors[color as Color];
  const displayColor = paletteColor || color;

  function handleControlClick(event: MouseEvent<HTMLDivElement>) {
    if (showColorMenu) {
      setShowColorMenu(false);
      setColorMenuOptions({});
    } else {
      setShowColorMenu(true);
      const rect = event.currentTarget.getBoundingClientRect();
      setColorMenuOptions({
        left: `${rect.left + rect.width / 2}px`,
        top: `${rect.bottom + 16}px`,
        style: { transform: "translateX(-50%)" },
        excludeNode: event.currentTarget,
      });
    }
  }

  const colorMenu = (
    <MapMenu
      isOpen={showColorMenu}
      onRequestClose={() => {
        setShowColorMenu(false);
        setColorMenuOptions({});
      }}
      {...colorMenuOptions}
    >
      <Box
        sx={{
          width: "120px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
        p={1}
      >
        {palette.map((c) => (
          <ColorCircle
            key={c}
            color={colors[c]}
            selected={c === color}
            onClick={() => {
              onColorChange(c);
              setShowColorMenu(false);
              setColorMenuOptions({});
            }}
            sx={{ width: "25%", paddingTop: "25%" }}
          />
        ))}
      </Box>
      <Box px={2} pb={2}>
        <Label htmlFor="spell-template-color">Custom</Label>
        <Input
          id="spell-template-color"
          type="color"
          value={displayColor.startsWith("#") ? displayColor : "#ff4d4d"}
          onChange={(event) => onColorChange(event.target.value)}
        />
      </Box>
    </MapMenu>
  );

  return (
    <>
      <ColorCircle
        color={displayColor}
        selected
        onClick={handleControlClick}
        sx={{ width: "32px", height: "32px", transform: "scale(1)" }}
      />
      {colorMenu}
    </>
  );
}
function SpellTemplateToolSettings({
  settings,
  onSettingChange,
}: SpellTemplateToolSettingsProps) {
  const isSmallScreen = useMedia({ query: "(max-width: 799px)" });
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [settingsMenuOptions, setSettingsMenuOptions] = useState({});

  const toolIconSx = {
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    "& svg": {
      width: "28px",
      height: "28px",
    },
  };

  const tools = [
    {
      id: "circle",
      title: "Circle",
      isSelected: settings.type === "circle",
      icon: (
        <Box sx={toolIconSx}>
          <BrushCircleIcon />
        </Box>
      ),
    },
    {
      id: "rectangle",
      title: "Rectangle",
      isSelected: settings.type === "rectangle",
      icon: (
        <Box sx={toolIconSx}>
          <BrushRectangleIcon />
        </Box>
      ),
    },
    {
      id: "cone",
      title: "Cone",
      isSelected: settings.type === "cone",
      icon: (
        <Box sx={toolIconSx}>
          <BrushTriangleIcon />
        </Box>
      ),
    },
    {
      id: "line",
      title: "Line",
      isSelected: settings.type === "line",
      icon: (
        <Box sx={toolIconSx}>
          <BrushLineIcon />
        </Box>
      ),
    },
    {
      id: "ring",
      title: "Ring",
      isSelected: settings.type === "ring",
      icon: (
        <Box sx={toolIconSx}>
          <BrushCircleIcon />
        </Box>
      ),
    },
    {
      id: "path",
      title: "Wall",
      isSelected: settings.type === "path",
      icon: (
        <Box sx={toolIconSx}>
          <BrushLineIcon />
        </Box>
      ),
    },
  ];

  const selectedRule = ruleOptions.find((rule) => rule.value === settings.rule);

  function handleSettingsClick(event: MouseEvent<HTMLButtonElement>) {
    if (showSettingsMenu) {
      setShowSettingsMenu(false);
      setSettingsMenuOptions({});
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setShowSettingsMenu(true);
    setSettingsMenuOptions({
      left: `${rect.left + rect.width / 2}px`,
      top: `${rect.bottom + 16}px`,
      style: { transform: "translateX(-50%)" },
      excludeNode: event.currentTarget,
    });
  }

  const settingsMenu = (
    <MapMenu
      isOpen={showSettingsMenu}
      onRequestClose={() => {
        setShowSettingsMenu(false);
        setSettingsMenuOptions({});
      }}
      {...settingsMenuOptions}
    >
      <Box
        sx={{
          width: "320px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
        p={2}
      >
        <Box>
          <Label>Rule</Label>
          <Select
            value={selectedRule || null}
            options={ruleOptions}
            onChange={(option: any) =>
              onSettingChange({ rule: option?.value || "center" })
            }
          />
        </Box>
        <Divider />
        <Flex sx={{ gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ minWidth: "140px", flex: "1 1 140px" }}>
            <Label htmlFor="spell-template-line-width">Width (cells)</Label>
            <Input
              id="spell-template-line-width"
              type="number"
              min={0.25}
              step={0.25}
              value={settings.lineWidth}
              onChange={(event) =>
                onSettingChange({
                  lineWidth: Math.max(0, Number(event.target.value) || 0),
                })
              }
            />
          </Box>
          <Box sx={{ minWidth: "140px", flex: "1 1 140px" }}>
            <Label htmlFor="spell-template-cone-angle">Angle (deg)</Label>
            <Input
              id="spell-template-cone-angle"
              type="number"
              min={10}
              max={180}
              step={5}
              value={settings.coneAngle}
              onChange={(event) =>
                onSettingChange({
                  coneAngle: Math.max(1, Number(event.target.value) || 0),
                })
              }
            />
          </Box>
          <Box sx={{ minWidth: "140px", flex: "1 1 140px" }}>
            <Label htmlFor="spell-template-ring-inner">Inner Ratio</Label>
            <Input
              id="spell-template-ring-inner"
              type="number"
              min={0}
              max={0.9}
              step={0.05}
              value={settings.ringInnerRatio}
              onChange={(event) =>
                onSettingChange({
                  ringInnerRatio: Math.min(
                    0.95,
                    Math.max(0, Number(event.target.value) || 0)
                  ),
                })
              }
            />
          </Box>
        </Flex>
        <Divider />
        <Flex sx={{ gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ minWidth: "140px", flex: "1 1 140px" }}>
            <Label htmlFor="spell-template-opacity">Opacity</Label>
            <Input
              id="spell-template-opacity"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={settings.opacity}
              onChange={(event) =>
                onSettingChange({
                  opacity: Math.min(1, Math.max(0, Number(event.target.value))),
                })
              }
            />
          </Box>
          <Box sx={{ minWidth: "140px", flex: "1 1 140px" }}>
            <Label htmlFor="spell-template-stroke">Stroke</Label>
            <Input
              id="spell-template-stroke"
              type="number"
              min={0.1}
              step={0.1}
              value={settings.strokeWidth}
              onChange={(event) =>
                onSettingChange({
                  strokeWidth: Math.max(0, Number(event.target.value) || 0),
                })
              }
            />
          </Box>
        </Flex>
      </Box>
    </MapMenu>
  );

  return (
    <Flex
      sx={{
        alignItems: "center",
        flexWrap: isSmallScreen ? "wrap" : "nowrap",
        gap: 2,
      }}
    >
      <SpellTemplateColorControl
        color={settings.color}
        onColorChange={(color) => onSettingChange({ color })}
      />
      <Divider vertical />
      <ToolSection
        tools={tools}
        onToolClick={(tool) =>
          onSettingChange({ type: tool.id as SpellTemplateType })
        }
        collapse={isSmallScreen}
      />
      <Divider vertical />
      <IconButton
        aria-label={
          settings.previewOnRotate
            ? "Disable Real-time Preview"
            : "Enable Real-time Preview"
        }
        title={
          settings.previewOnRotate
            ? "Disable Real-time Preview"
            : "Enable Real-time Preview"
        }
        onClick={() =>
          onSettingChange({ previewOnRotate: !settings.previewOnRotate })
        }
        sx={{ color: settings.previewOnRotate ? "primary" : "text" }}
      >
        {settings.previewOnRotate ? <FogPreviewOnIcon /> : <FogPreviewOffIcon />}
      </IconButton>
      <IconButton
        aria-label="Template Settings"
        title="Template Settings"
        onClick={handleSettingsClick}
        sx={{ color: showSettingsMenu ? "primary" : "text" }}
      >
        <SettingsIcon />
      </IconButton>
      {settingsMenu}
    </Flex>
  );
}

export default SpellTemplateToolSettings;
