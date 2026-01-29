import React, { useEffect } from "react";

function usePreventOverscroll(elementRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    // Stop overscroll on chrome and safari
    // also stop pinch to zoom on chrome
    function preventOverscroll(event: WheelEvent) {
      const path = event.composedPath ? event.composedPath() : [];
      for (const node of path) {
        if (
          node instanceof HTMLElement &&
          node.dataset &&
          node.dataset.noteScroll === "true"
        ) {
          return;
        }
      }
      event.preventDefault();
    }
    const element = elementRef.current;
    if (element) {
      element.addEventListener("wheel", preventOverscroll, {
        passive: false,
      });
    }

    return () => {
      if (element) {
        element.removeEventListener("wheel", preventOverscroll);
      }
    };
  }, [elementRef]);
}

export default usePreventOverscroll;
