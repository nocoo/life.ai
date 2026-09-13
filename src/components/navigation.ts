import type { LucideIcon } from "lucide-react";
import { CalendarClock, KeyRound, Settings, Upload } from "lucide-react";

export interface NavItem {
	href: string;
	label: string;
	icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
	{ href: "/", label: "时间线", icon: CalendarClock },
	{ href: "/imports", label: "导入", icon: Upload },
	{ href: "/connect", label: "Connect", icon: KeyRound },
	{ href: "/settings/ai", label: "AI 设置", icon: Settings },
];

export const ROUTE_META: Record<string, { title: string; description: string }> = {
	"/": {
		title: "时间线",
		description: "按本地日期查看 24 小时与全天记录",
	},
	"/imports": {
		title: "导入",
		description: "导入 Apple Health XML、足迹 GPX、貔貅 CSV 与日记 JSON/NDJSON",
	},
	"/connect": {
		title: "Connect",
		description: "签发只写令牌，按 UTC 小时覆盖写入",
	},
	"/settings/ai": {
		title: "AI 设置",
		description: "配置 Workers AI 或其他模型",
	},
};

export function routeMeta(pathname: string): { title: string; description: string } {
	return ROUTE_META[pathname] ?? { title: "未找到", description: "" };
}
