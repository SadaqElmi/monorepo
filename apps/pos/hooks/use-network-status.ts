"use client";

import { useCallback, useEffect, useState } from "react";

export function useNetworkStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [apiReachable, setApiReachable] = useState(true);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const markApiUnreachable = useCallback(() => setApiReachable(false), []);
  const markApiReachable = useCallback(() => setApiReachable(true), []);

  const isOffline = !online || !apiReachable;

  return {
    online,
    apiReachable,
    isOffline,
    markApiUnreachable,
    markApiReachable,
  };
}
