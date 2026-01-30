import Settings from "./helpers/Settings";

function loadVersions(settings: Settings) {
  settings.version(1, () => ({
    fog: {
      type: "polygon",
      useEdgeSnapping: false,
      useFogCut: false,
      preview: false,
    },
    drawing: {
      color: "red",
      type: "brush",
      useBlending: true,
      opacity: 1,
      strokeWidth: 1,
      dashStyle: "solid",
    },
    measure: {
      type: "chebyshev",
      scale: "5ft",
    },
    timer: {
      hour: 0,
      minute: 0,
      second: 0,
    },
    dice: {
      shareDice: false,
      style: "galaxy",
    },
  }));
  // v1.5.2 - Added full screen support for map and label size
  settings.version(2, (prev: any) => ({
    ...prev,
    map: { fullScreen: false, labelSize: 1 },
  }));
  // v1.7.0 - Added game password
  settings.version(3, (prev: any) => ({
    ...prev,
    game: { usePassword: true },
  }));
  // v1.8.0 - Added pointer color, grid snapping sensitivity and remove measure
  settings.version(4, (prev: any) => {
    let newSettings = {
      ...prev,
      pointer: { color: "red" },
      map: { ...prev.map, gridSnappingSensitivity: 0.2 },
    };
    delete newSettings.measure;
    return newSettings;
  });
  // v1.8.0 - Removed edge snapping for multilayer
  settings.version(5, (prev: any) => {
    let newSettings = { ...prev };
    delete newSettings.fog.useEdgeSnapping;
    newSettings.fog.multilayer = false;
    return newSettings;
  });
  // v1.8.1 - Add show guides toggle
  settings.version(6, (prev: any) => ({
    ...prev,
    fog: { ...prev.fog, showGuides: true },
  }));
  // v1.8.1 - Add fog edit opacity
  settings.version(7, (prev: any) => ({
    ...prev,
    fog: { ...prev.fog, editOpacity: 0.5 },
  }));
  // v1.10.0 - Add select tool
  settings.version(8, (prev: any) => ({
    ...prev,
    select: { type: "rectangle" },
  }));
  // v1.10.0 - Add use shape fill setting
  settings.version(9, (prev: any) => ({
    ...prev,
    drawing: {
      ...prev.drawing,
      useShapeFill: true,
    },
  }));
  // v1.11.0 - Add image compression quality
  settings.version(10, (prev: any) => ({
    ...prev,
    asset: {
      compressionQuality: prev?.asset?.compressionQuality ?? 0.8,
    },
  }));
  // v1.12.0 - Add spell template tool settings
  settings.version(11, (prev: any) => ({
    ...prev,
    spellTemplates: {
      type: "circle",
      rule: "center",
      color: "red",
      opacity: 0.5,
      strokeWidth: 1,
      lineWidth: 1,
      coneAngle: 90,
      ringInnerRatio: 0.5,
      previewOnRotate: true,
    },
  }));
  // v1.13.0 - Add token note settings
  settings.version(12, (prev: any) => ({
    ...prev,
    tokenNote: {
      enabled: false,
      trigger: "longPress",
      longPressMs: 500,
      blur: "high",
      fontSize: "md",
      defaultFont: "default",
      defaultPermission: "write",
    },
  }));
  // v1.14.0 - Add drawing opacity/stroke width/dash style
  settings.version(13, (prev: any) => ({
    ...prev,
    drawing: {
      ...prev.drawing,
      opacity:
        typeof prev?.drawing?.opacity === "number"
          ? prev.drawing.opacity
          : prev?.drawing?.useBlending
          ? 0.5
          : 1,
      strokeWidth:
        typeof prev?.drawing?.strokeWidth === "number"
          ? prev.drawing.strokeWidth
          : 1,
      dashStyle: prev?.drawing?.dashStyle ?? "solid",
    },
  }));
}

export function getSettings() {
  let settings = new Settings("OwlbearRodeoSettings");
  loadVersions(settings);
  return settings;
}
