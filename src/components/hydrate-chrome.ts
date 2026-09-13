const THEME_KEY = "theme";
const ACCENT_KEY = "basalt-accent";
const PRIMARY_LIGHT = "217 91% 60%";
const PRIMARY_DARK = "217 91% 65%";

export function hydrateDocumentChrome(): void {
	if (typeof document === "undefined") {
		return;
	}
	let storedTheme: string | null = null;
	try {
		storedTheme = window.localStorage.getItem(THEME_KEY);
	} catch {
		storedTheme = null;
	}
	let prefersDark = false;
	try {
		prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	} catch {
		prefersDark = false;
	}
	const isDark = storedTheme === "dark" || (storedTheme !== "light" && prefersDark);
	const root = document.documentElement;
	root.classList.toggle("dark", isDark);
	root.classList.toggle("light", !isDark);
	root.dataset.mode = isDark ? "dark" : "light";

	let accent = "primary";
	try {
		accent = window.localStorage.getItem(ACCENT_KEY) || "primary";
	} catch {
		accent = "primary";
	}
	root.dataset.accent = accent;
	if (accent === "primary") {
		const primary = isDark ? PRIMARY_DARK : PRIMARY_LIGHT;
		root.style.setProperty("--basalt-primary", primary);
		root.style.setProperty("--basalt-ring", primary);
	}
}
