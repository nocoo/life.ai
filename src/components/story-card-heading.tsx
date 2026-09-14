import { Text } from "@nocoo/basalt";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function StoryCardHeading({
	icon: Icon,
	title,
	subtitle,
	as = "h2",
}: {
	icon: LucideIcon;
	title: ReactNode;
	subtitle?: ReactNode;
	as?: "h2" | "h3";
}) {
	return (
		<div className="story-card-heading">
			<span className="story-card-icon" aria-hidden="true">
				<Icon size={20} strokeWidth={1.6} />
			</span>
			<div className="story-card-heading-copy">
				<Text as={as} variant="heading" size={as === "h2" ? "md" : "sm"}>
					{title}
				</Text>
				{subtitle ? (
					<Text as="p" size="xs" tone="muted">
						{subtitle}
					</Text>
				) : null}
			</div>
		</div>
	);
}

export function StoryMetricLabel({
	icon: Icon,
	children,
}: {
	icon: LucideIcon;
	children: ReactNode;
}) {
	return (
		<span className="story-metric-label">
			<Icon size={14} strokeWidth={1.6} aria-hidden="true" />
			{children}
		</span>
	);
}
