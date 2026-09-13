import { Button } from "@nocoo/basalt";
import { DatePicker } from "@nocoo/basalt/components/date-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface DateNavigationProps {
	day: string;
	isToday: boolean;
	onPrevDay: () => void;
	onNextDay: () => void;
	onToday: () => void;
	onSelectDay: (day: string) => void;
}

export function DateNavigation({
	day,
	isToday,
	onPrevDay,
	onNextDay,
	onToday,
	onSelectDay,
}: DateNavigationProps) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button variant="outline" size="sm" onClick={onToday} disabled={isToday}>
				今天
			</Button>
			<Button variant="ghost" size="icon" onClick={onPrevDay} aria-label="前一天">
				<ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
			</Button>
			<DatePicker
				value={day}
				onChange={onSelectDay}
				locale="zh-CN"
				weekStartsOn={1}
				aria-label="选择日期"
				labels={{
					calendar: "日历",
					previousMonth: "上个月",
					nextMonth: "下个月",
					placeholder: "选择日期",
				}}
			/>
			<Button variant="ghost" size="icon" onClick={onNextDay} aria-label="后一天">
				<ChevronRight className="h-4 w-4" strokeWidth={1.5} />
			</Button>
		</div>
	);
}
