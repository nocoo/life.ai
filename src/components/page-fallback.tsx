import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { useLocation } from "react-router";
import { routeMeta } from "./navigation";

export function PageFallback() {
	const meta = routeMeta(useLocation().pathname);
	return (
		<div className="min-w-0 space-y-6">
			<PageHeader title={meta.title} description={meta.description} />
			<LayerCard>
				<LayerCard.Loading label="正在加载页面" />
			</LayerCard>
		</div>
	);
}
