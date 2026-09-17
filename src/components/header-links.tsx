import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@nocoo/basalt";
import { useTheme } from "@nocoo/basalt/providers/theme";
import { createLucideIcon, Monitor, Moon, Sun } from "lucide-react";
import type { ReactElement } from "react";
import { GITHUB_REPO_URL } from "./brand";

const Github = createLucideIcon("Github", [
	[
		"path",
		{
			d: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4",
			key: "tonef",
		},
	],
	["path", { d: "M9 18c-4.51 2-5-2-7-2", key: "9comsn" }],
]);

export function HeaderTooltip({ label, children }: { label: string; children: ReactElement }) {
	return (
		<Tooltip delayDuration={0}>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side="bottom" sideOffset={6}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

function HeaderIconLink({
	label,
	href,
	children,
}: {
	label: string;
	href: string;
	children: ReactElement;
}) {
	return (
		<HeaderTooltip label={label}>
			<Button variant="ghost" size="icon" asChild>
				<a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
					{children}
					<span className="sr-only">{label}</span>
				</a>
			</Button>
		</HeaderTooltip>
	);
}

export function HeaderActions() {
	const { theme, setTheme } = useTheme();
	const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
	const themeLabel =
		nextTheme === "system" ? "使用系统主题" : nextTheme === "light" ? "切换到浅色" : "切换到深色";
	const ThemeIcon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;

	return (
		<>
			<HeaderIconLink label="GitHub 仓库" href={GITHUB_REPO_URL}>
				<Github className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.5} />
			</HeaderIconLink>
			<HeaderIconLink label="Life.ai on hexly.ai" href="https://hexly.ai/projects/life-ai">
				<svg
					className="h-[18px] w-[18px]"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="m12 2 8.66 5v10L12 22l-8.66-5V7Z" />
					<path d="M12 2v20M3.34 7l17.32 10m0-10L3.34 17" />
				</svg>
			</HeaderIconLink>
			<HeaderTooltip label={themeLabel}>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => setTheme(nextTheme)}
					aria-label={`切换主题（当前 ${theme}）`}
				>
					<ThemeIcon className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.5} />
				</Button>
			</HeaderTooltip>
		</>
	);
}
