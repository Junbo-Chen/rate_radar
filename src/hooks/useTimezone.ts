import { createContext, createElement, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

export type TimeZoneMode = "utc" | "local";

/**
 * Alles wordt in de lokale zone van de browser getoond, zodat de tijden op het
 * scherm aansluiten op de klok van degene die ernaar kijkt.
 *
 * Let op bij het vergelijken met de back-end: de bron levert UTC (Z-timestamps).
 * In CEST scheelt dat 2 uur, dus 13:29:55 op het scherm is 11:29:55Z in de
 * database. De metaregel noemt daarom de actieve zone én de offset.
 *
 * De modus is bewust niet persistent — er is geen schakelaar in de UI, en een
 * opgeslagen waarde uit een eerdere sessie overschreef eerder stilletjes de
 * standaard.
 */
const DEFAULT_MODE: TimeZoneMode = "local";

interface TimezoneContextValue {
  mode: TimeZoneMode;
  setMode: (mode: TimeZoneMode) => void;
}

const TimezoneContext = createContext<TimezoneContextValue>({
  mode: DEFAULT_MODE,
  setMode: () => {},
});

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<TimeZoneMode>(DEFAULT_MODE);

  const setMode = useCallback((next: TimeZoneMode) => setModeState(next), []);

  return createElement(TimezoneContext.Provider, { value: { mode, setMode } }, children);
}

export function useTimezone(): TimezoneContextValue {
  return useContext(TimezoneContext);
}
