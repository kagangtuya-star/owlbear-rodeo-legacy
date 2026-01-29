import React, { createContext, useContext } from "react";

type ImageImportContextValue = {
  openImportFromUrl: () => void;
};

const ImageImportContext = createContext<ImageImportContextValue | undefined>(
  undefined
);

export function ImageImportProvider({
  openImportFromUrl,
  children,
}: {
  openImportFromUrl: () => void;
  children: React.ReactNode;
}) {
  return (
    <ImageImportContext.Provider value={{ openImportFromUrl }}>
      {children}
    </ImageImportContext.Provider>
  );
}

export function useImageImport() {
  return useContext(ImageImportContext);
}
