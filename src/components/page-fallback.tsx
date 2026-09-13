import { LayerCard } from "@nocoo/basalt/components/layer-card";

export function PageFallback() {
	return (
		<LayerCard>
			<LayerCard.Loading label="正在加载页面" />
		</LayerCard>
	);
}
