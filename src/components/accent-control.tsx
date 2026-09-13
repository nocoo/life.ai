import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@nocoo/basalt";
import { useAccent } from "@nocoo/basalt/providers/accent";
import { Palette } from "lucide-react";

export function AccentControl() {
	const { accent, setAccent, swatches } = useAccent();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="切换强调色">
					<Palette className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{swatches.map((swatch) => (
					<DropdownMenuItem
						key={swatch.id}
						onSelect={() => setAccent(swatch.id)}
						aria-current={swatch.id === accent ? "true" : undefined}
					>
						{swatch.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
