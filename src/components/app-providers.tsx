import { LinkProvider, Toaster, TooltipProvider } from "@nocoo/basalt";
import { AccentProvider } from "@nocoo/basalt/providers/accent";
import { ThemeProvider } from "@nocoo/basalt/providers/theme";
import type { ReactNode } from "react";
import { AppLink } from "./app-link";

const LIFE_PRIMARY = {
	light: "217 91% 60%",
	dark: "217 91% 65%",
};

export function AppProviders({ children }: { children: ReactNode }) {
	return (
		<ThemeProvider>
			<AccentProvider defaultAccent="primary" paletteOverrides={{ primary: LIFE_PRIMARY }}>
				<LinkProvider render={AppLink}>
					<TooltipProvider>
						{children}
						<Toaster position="bottom-right" />
					</TooltipProvider>
				</LinkProvider>
			</AccentProvider>
		</ThemeProvider>
	);
}
