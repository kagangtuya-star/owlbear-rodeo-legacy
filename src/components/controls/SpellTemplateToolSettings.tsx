import { MouseEventHandler, useState } from "react";
import type { MouseEvent } from "react";
import { Box, Flex, Input, Label, SxProp } from "theme-ui";
import { useMedia } from "react-media";

import ToolSection from "./shared/ToolSection";
import Divider from "../Divider";
import Select from "../Select";
import MapMenu from "../map/MapMenu";

import BrushRectangleIcon from "../../icons/BrushRectangleIcon";
import BrushCircleIcon from "../../icons/BrushCircleIcon";
import BrushLineIcon from "../../icons/BrushLineIcon";
import BrushTriangleIcon from "../../icons/BrushTriangleIcon";

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
        sx={{ width: "24px", height: "24px" }}
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

  const tools = [
    {
      id: "circle",
      title: "Circle",
      isSelected: settings.type === "circle",
      icon: <BrushCircleIcon />,
    },
    {
      id: "rectangle",
      title: "Rectangle",
      isSelected: settings.type === "rectangle",
      icon: <BrushRectangleIcon />,
    },
    {
      id: "cone",
      title: "Cone",
      isSelected: settings.type === "cone",
      icon: <BrushTriangleIcon />,
    },
    {
      id: "line",
      title: "Line",
      isSelected: settings.type === "line",
      icon: <BrushLineIcon />,
    },
    {
      id: "ring",
      title: "Ring",
      isSelected: settings.type === "ring",
      icon: <BrushCircleIcon />,
    },
    {
      id: "path",
      title: "Wall",
      isSelected: settings.type === "path",
      icon: <BrushLineIcon />,
    },
  ];

  const selectedRule = ruleOptions.find((rule) => rule.value === settings.rule);

  return (
    <Flex
      sx={{
        alignItems: "center",
        minWidth: "840px",
        flexWrap: isSmallScreen ? "wrap" : "nowrap",
        rowGap: 2,
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
      <Box sx={{ minWidth: "180px" }}>
        <Select
          value={selectedRule || null}
          options={ruleOptions}
          onChange={(option: any) =>
            onSettingChange({ rule: option?.value || "center" })
          }
        />
      </Box>
      <Divider vertical />
      <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
        <Box>
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
        <Box>
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
        <Box>
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
      </Box>
      <Divider vertical />
      <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
        <Box>
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
        <Box>
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
      </Box>
    </Flex>
  );
}

export default SpellTemplateToolSettings;
