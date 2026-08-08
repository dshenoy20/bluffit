"use client";

import { useEffect } from "react";
import { attachSessionLifecycle, initSessionTracking } from "@/lib/analytics";

/** Mounted once in the root layout: counts visitors/sessions and tracks session duration. */
export function AnalyticsTracker() {
  useEffect(() => {
    void initSessionTracking();
    return attachSessionLifecycle();
  }, []);
  return null;
}
