"use client";

// The form's state (version, coordinate mode, advanced mode, structure list),
// saved in this browser so it's still there next visit.

import { useEffect, useState } from "react";
import type { VersionId } from "../minecraft";
import { blankEntry, type CoordMode, type Entry, newKey } from "./entries";

const STORAGE_KEY = "seed-cracker:v1";

export function useSavedForm() {
  const [version, setVersion] = useState<VersionId>("1.18+");
  const [mode, setMode] = useState<CoordMode>("block");
  const [advanced, setAdvanced] = useState(false);
  const [entries, setEntries] = useState<Entry[]>(() => [blankEntry("village"), blankEntry("desert_pyramid"), blankEntry("ocean_monument")]);
  // False until the saved form has been restored (only possible after mount).
  const [hydrated, setHydrated] = useState(false);

  // Restoring has to happen after mount, otherwise server and client HTML would differ.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.version) setVersion(saved.version);
        if (saved.mode) setMode(saved.mode);
        if (typeof saved.advanced === "boolean") setAdvanced(saved.advanced);
        if (Array.isArray(saved.entries) && saved.entries.length)
          setEntries(saved.entries.map((e: Omit<Entry, "key">) => ({ ...e, key: newKey() })));
      }
    } catch {}
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version, mode, advanced, entries: entries.map(({ structureId, x, z }) => ({ structureId, x, z })) }),
      );
    } catch {}
  }, [hydrated, version, mode, advanced, entries]);

  return { version, setVersion, mode, setMode, advanced, setAdvanced, entries, setEntries, hydrated };
}
