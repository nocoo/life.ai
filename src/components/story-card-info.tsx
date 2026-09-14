import { Button, Text } from "@nocoo/basalt";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@nocoo/basalt/components/hover-card";
import { Info } from "lucide-react";
import { useId, useState } from "react";

export function StoryCardInfo({ label, notes }: { label: string; notes: string[] }) {
	const [open, setOpen] = useState(false);
	const id = useId();
	if (!notes.length) return null;
	return (
		<HoverCard open={open} onOpenChange={setOpen} openDelay={120} closeDelay={120}>
			<HoverCardTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="story-card-info"
					aria-label={`查看${label}的来源与说明`}
					aria-expanded={open}
					aria-controls={open ? id : undefined}
					aria-describedby={open ? id : undefined}
					onClick={() => setOpen(true)}
					onTouchStart={(event) => {
						event.preventDefault();
						setOpen((current) => !current);
					}}
				>
					<Info size={16} strokeWidth={1.5} aria-hidden="true" />
				</Button>
			</HoverCardTrigger>
			<HoverCardContent
				id={id}
				role="tooltip"
				align="end"
				collisionPadding={12}
				className="story-card-info-panel"
			>
				<Text as="p" size="sm" variant="heading">
					来源与说明
				</Text>
				<ul>
					{[...new Set(notes)].map((note) => (
						<li key={note}>{note}</li>
					))}
				</ul>
			</HoverCardContent>
		</HoverCard>
	);
}
