"use client";

import { Suspense } from "react";
import { Home } from "@/components/Home";

/** Suspense boundary for useSearchParams on the library home. */
export function HomeClient() {
  return (
    <Suspense
      fallback={
        <div className="sigma-home">
          <div className="sigma-home-bg" aria-hidden />
          <div className="sigma-status-banner" style={{ margin: 32 }}>
            Loading library…
          </div>
        </div>
      }
    >
      <Home />
    </Suspense>
  );
}
