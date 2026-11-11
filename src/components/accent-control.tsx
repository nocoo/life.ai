import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@nocoo/basalt";
import { HeaderAction } from "@nocoo/basalt/components/app-header";
import { useAccent } from "@nocoo/basalt/providers/accent";
import { Palette } from "lucide-react";

export function AccentControl() {
	const { accent, setAccent, swatches } = useAccent();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<HeaderAction label="Accent color" tooltip="Accent color">
					<Palette aria-hidden="true" strokeWidth={1.5} />
				</HeaderAction>
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
