// Chart/map colours come from the design-system CSS variables (so dark mode works); fallbacks match styles.css.
const css = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name) || "").trim() || fallback;
export const colors = () => ({ primary: css("--brand", "#0b6e6e"), secondary: css("--brand-strong", "#085454"), accent: css("--warn", "#8a5a00"), star: "#e0a100", text: css("--text", "#1b2330") });
