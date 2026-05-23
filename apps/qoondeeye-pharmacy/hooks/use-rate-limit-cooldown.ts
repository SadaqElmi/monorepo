"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/lib/services/http";

export function useRateLimitCooldown() {
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const applyRateLimit = useCallback((error: unknown) => {
    if (!(error instanceof ApiError) || !error.isRateLimited) return false;
    const sec = error.retryAfterSeconds ?? 30;
    setCooldownUntil(Date.now() + sec * 1000);
    return true;
  }, []);

  const isCoolingDown = secondsLeft > 0;

  useEffect(() => {
    if (!cooldownUntil) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) setCooldownUntil(0);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  return { isCoolingDown, secondsLeft, applyRateLimit };
}
