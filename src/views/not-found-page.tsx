import { Button, LayerCard } from "@nocoo/basalt";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { useNavigate } from "react-router";

export function NotFoundPage() {
	const navigate = useNavigate();
	return (
		<div className="space-y-6">
			<PageHeader title="未找到" description="没有这个页面。" />
			<LayerCard>
				<LayerCard.Empty
					title="页面不存在"
					description="请从侧栏打开时间线、导入或 Connect。"
					action={<Button onClick={() => navigate("/")}>回到时间线</Button>}
				/>
			</LayerCard>
		</div>
	);
}
