export const THEMES = [
  { id: "green", label: "Green", swatch: "#7ddc57" },
  { id: "blue", label: "Blue", swatch: "#3b82f6" },
  { id: "red", label: "Red", swatch: "#ef4444" },
  { id: "orange", label: "Orange", swatch: "#fb923c" },
  { id: "pink", label: "Pink", swatch: "#f472b6" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "green";
export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
