"use client";

import { useRouter } from "next/navigation";

import { PosTerminalSetup } from "@/features/auth";

export default function SetupPage() {
  const router = useRouter();
  return <PosTerminalSetup onBound={() => router.push("/")} />;
}
