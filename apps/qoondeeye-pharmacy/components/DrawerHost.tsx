"use client";

import * as React from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type DrawerPayload = {
  title: string;
  description?: string;
  content: React.ReactNode;
};

type DrawerContextValue = {
  openDrawer: (payload: DrawerPayload) => void;
  closeDrawer: () => void;
};

const DrawerContext = React.createContext<DrawerContextValue | null>(null);

export function DrawerHostProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<DrawerPayload | null>(null);

  const openDrawer = React.useCallback((payload: DrawerPayload) => {
    setState(payload);
  }, []);

  const closeDrawer = React.useCallback(() => {
    setState(null);
  }, []);

  const value = React.useMemo(
    () => ({ openDrawer, closeDrawer }),
    [openDrawer, closeDrawer],
  );

  return (
    <DrawerContext.Provider value={value}>
      {children}
      <Sheet
        open={Boolean(state)}
        onOpenChange={(open) => {
          if (!open) setState(null);
        }}
      >
        <SheetContent side="right" className="flex w-full max-w-md flex-col sm:max-w-lg">
          {state ? (
            <>
              <SheetHeader className="text-left">
                <SheetTitle>{state.title}</SheetTitle>
                {state.description ? (
                  <SheetDescription>{state.description}</SheetDescription>
                ) : null}
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-1 pb-6">{state.content}</div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </DrawerContext.Provider>
  );
}

export function useDrawerHost(): DrawerContextValue {
  const ctx = React.useContext(DrawerContext);
  if (!ctx) {
    throw new Error("useDrawerHost requires DrawerHostProvider");
  }
  return ctx;
}
