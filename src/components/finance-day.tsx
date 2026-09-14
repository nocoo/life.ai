import {
	Button,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	LayerCard,
	Text,
} from "@nocoo/basalt";
import {
	ArrowDownLeft,
	ArrowUpRight,
	Coffee,
	ReceiptText,
	ShoppingBag,
	TrainFront,
	Utensils,
	Wallet,
} from "lucide-react";
import { type FinanceDay, formatMinor } from "../models/finance";
import { timelineStore } from "../viewmodels/timeline-view-model";
import { StoryCardHeading } from "./story-card-heading";
import { StoryCardInfo } from "./story-card-info";
import "./finance-day.css";

function categoryIcon(name: string) {
	if (/咖啡|奶茶|饮料|茶饮/.test(name)) return Coffee;
	if (/餐|食|饭|零食|外卖/.test(name)) return Utensils;
	if (/车|交通|地铁|打的|飞机/.test(name)) return TrainFront;
	if (/购|服|日用|数码/.test(name)) return ShoppingBag;
	return ReceiptText;
}

export function FinanceDayCard({ finance }: { finance: FinanceDay }) {
	if (!finance.recordCount) return null;
	return (
		<LayerCard className="story-card finance-day">
			<StoryCardInfo
				label="一日账目"
				notes={[
					"来源：貔貅记账。原始数据只有日期，不代表发生在零点或任意具体时刻。",
					`北京时间记账日：${finance.sourceDates.join("、") || "未注明"}。跨时区时，整份账目随其北京时间账期起点归属一天，不拆分重复累计。`,
					"日常支出仅统计原分类的流出，支出类流入另列；转账、还款、余额调整、投资等不计入日常消费。不同币种不换算相加。",
					...finance.accounts.map((account) => `账户：${account}`),
				]}
			/>
			<LayerCard.Header>
				<StoryCardHeading icon={Wallet} title="一日账目" />
			</LayerCard.Header>
			<LayerCard.Body className="space-y-5">
				{finance.currencies.map((currency) => (
					<section
						key={currency.currency}
						className="finance-currency"
						aria-label={`${currency.currency} 当日账目`}
					>
						<div className="finance-totals">
							<div>
								<Text as="p" size="xs" tone="muted">
									<ArrowUpRight size={14} aria-hidden="true" />
									日常消费 · {currency.currency}
								</Text>
								<strong>{formatMinor(currency.expenseMinor)}</strong>
							</div>
							{currency.incomeMinor !== 0 ? (
								<div className="finance-income">
									<Text as="p" size="xs" tone="muted">
										<ArrowDownLeft size={14} aria-hidden="true" />
										日常收入
									</Text>
									<strong>{formatMinor(currency.incomeMinor)}</strong>
								</div>
							) : null}
						</div>
						{currency.categories.length ? (
							<ul className="finance-categories">
								{currency.categories.slice(0, 6).map((category) => {
									const Icon = categoryIcon(category.name);
									return (
										<li key={category.name}>
											<span className="finance-category-name">
												<Icon size={16} strokeWidth={1.6} aria-hidden="true" />
												{category.name}
												<small>{category.count > 1 ? `×${category.count}` : ""}</small>
											</span>
											<span>{formatMinor(category.amountMinor)}</span>
										</li>
									);
								})}
							</ul>
						) : null}
						{currency.expenseInflowMinor !== 0 ? (
							<Text as="p" size="xs" tone="muted">
								支出类另有流入 {formatMinor(currency.expenseInflowMinor)}，保留原分类。
							</Text>
						) : null}
						{currency.classifications.some(
							(item) => item.name !== "日常支出" && item.name !== "日常收入",
						) ? (
							<Collapsible className="story-disclosure">
								<CollapsibleTrigger>其他资金往来</CollapsibleTrigger>
								<CollapsibleContent>
									<ul className="finance-other">
										{currency.classifications
											.filter((item) => item.name !== "日常支出" && item.name !== "日常收入")
											.map((item) => (
												<li key={item.name}>
													<span>
														{item.name} · {item.count} 笔
													</span>
													<span>
														入 {formatMinor(item.inflowMinor)} / 出 {formatMinor(item.outflowMinor)}
													</span>
												</li>
											))}
									</ul>
								</CollapsibleContent>
							</Collapsible>
						) : null}
					</section>
				))}
				{finance.notes.length ? (
					<div className="finance-notes">
						<Text as="p" size="xs" tone="muted">
							账本里的生活片段
						</Text>
						{finance.notes.slice(0, 3).map((note) => (
							<Text as="p" size="sm" key={note}>
								{note}
							</Text>
						))}
					</div>
				) : null}
				<Button
					variant="ghost"
					size="sm"
					onClick={() => timelineStore.getState().selectTab("finance")}
				>
					查看 {finance.recordCount} 笔原始账目 <ArrowUpRight size={14} aria-hidden="true" />
				</Button>
			</LayerCard.Body>
		</LayerCard>
	);
}
