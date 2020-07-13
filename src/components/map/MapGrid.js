import React, { useContext, useEffect, useState } from "react";
import { Line, Group } from "react-konva";
import useImage from "use-image";

import MapInteractionContext from "../../contexts/MapInteractionContext";

import useDataSource from "../../helpers/useDataSource";
import { mapSources as defaultMapSources } from "../../maps";

import { getStrokeWidth } from "../../helpers/drawing";
import { getImageLightness } from "../../helpers/image";

function MapGrid({ map, gridSize }) {
  const mapSource = useDataSource(map, defaultMapSources);
  const [mapImage, mapLoadingStatus] = useImage(mapSource);

  const gridX = map && map.gridX;
  const gridY = map && map.gridY;

  const { mapWidth, mapHeight } = useContext(MapInteractionContext);

  const lineSpacingX = mapWidth / gridX;
  const lineSpacingY = mapHeight / gridY;

  const [isImageLight, setIsImageLight] = useState(true);

  // When the map changes find the average lightness of its pixels
  useEffect(() => {
    if (mapLoadingStatus === "loaded") {
      setIsImageLight(getImageLightness(mapImage));
    }
  }, [mapImage, mapLoadingStatus]);

  const lines = [];
  for (let x = 1; x < gridX; x++) {
    lines.push(
      <Line
        key={`grid_x_${x}`}
        points={[x * lineSpacingX, 0, x * lineSpacingX, mapHeight]}
        stroke={isImageLight ? "black" : "white"}
        strokeWidth={getStrokeWidth(0.1, gridSize, mapWidth, mapHeight)}
        opacity={0.5}
      />
    );
  }
  for (let y = 1; y < gridY; y++) {
    lines.push(
      <Line
        key={`grid_y_${y}`}
        points={[0, y * lineSpacingY, mapWidth, y * lineSpacingY]}
        stroke={isImageLight ? "black" : "white"}
        strokeWidth={getStrokeWidth(0.1, gridSize, mapWidth, mapHeight)}
        opacity={0.5}
      />
    );
  }

  return <Group>{lines}</Group>;
}

export default MapGrid;
