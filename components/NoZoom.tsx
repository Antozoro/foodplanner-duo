"use client";

import { useEffect } from "react";

/** Blocca lo zoom con due dita anche su iPhone, dove la regola del viewport viene ignorata. */
export function NoZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const stopMulti = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    document.addEventListener("gestureend", stop);
    document.addEventListener("touchmove", stopMulti, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("gestureend", stop);
      document.removeEventListener("touchmove", stopMulti);
    };
  }, []);
  return null;
}
