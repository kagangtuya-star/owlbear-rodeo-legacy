import React, { useState } from "react";
import { Box, SxProp, Input, Label } from "theme-ui";

import colors, { colorOptions, Color } from "../../../helpers/colors";
import MapMenu from "../../map/MapMenu";

type ColorCircleProps = {
  color: string;
  selected: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
} & SxProp;

function ColorCircle({ color, selected, onClick, sx }: ColorCircleProps) {
  return (
    <Box
      key={color}
      sx={{
        borderRadius: "50%",
        transform: "scale(0.75)",
        backgroundColor: colors[color as Color] || color,
        cursor: "pointer",
        ...sx,
      }}
      onClick={onClick}
      aria-label={`Brush Color ${color}`}
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
  exclude: Color[];
  allowCustom?: boolean;
};

function ColorControl({
  color,
  onColorChange,
  exclude,
  allowCustom,
}: ColorControlProps) {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [colorMenuOptions, setColorMenuOptions] = useState({});

  function handleControlClick(event: React.MouseEvent<HTMLDivElement>) {
    if (showColorMenu) {
      setShowColorMenu(false);
      setColorMenuOptions({});
    } else {
      setShowColorMenu(true);
      const rect = event.currentTarget.getBoundingClientRect();
      setColorMenuOptions({
        // Align the right of the submenu to the left of the tool and center vertically
        left: `${rect.left + rect.width / 2}px`,
        top: `${rect.bottom + 16}px`,
        style: { transform: "translateX(-50%)" },
        // Exclude this node from the sub menus auto close
        excludeNode: event.currentTarget,
      });
    }
  }

  const palette = colorOptions.filter((c) => !exclude.includes(c));
  const displayColor = colors[color as Color] || color;

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
          width: "104px",
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
      {allowCustom && (
        <Box px={2} pb={2}>
          <Label htmlFor="drawing-custom-color">Custom</Label>
          <Input
            id="drawing-custom-color"
            type="color"
            value={displayColor.startsWith("#") ? displayColor : "#ff4d4d"}
            onChange={(event) => {
              onColorChange(event.target.value);
              setShowColorMenu(false);
              setColorMenuOptions({});
            }}
          />
        </Box>
      )}
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

ColorControl.defaultProps = {
  exclude: [],
  allowCustom: false,
};

export default ColorControl;
