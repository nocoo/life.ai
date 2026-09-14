import { Badge, Button, Field, LayerCard, Text } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SensitiveInput } from "@nocoo/basalt/components/sensitive-input";
import { GitFork, Monitor, Newspaper } from "lucide-react";
import { useEffect } from "react";
import { useStore } from "zustand";
import { DaySourcesSkeleton } from "../components/page-skeletons";
import { DAY_SOURCE_NAMES, DAY_SOURCE_PROVIDERS } from "../models/day-sources";
import { daySourcesSettingsStore } from "../viewmodels/day-sources-view-model";

export function DaySourcesPage() {
	const state = useStore(daySourcesSettingsStore);
	useEffect(() => {
		void daySourcesSettingsStore.getState().load();
		return () => daySourcesSettingsStore.getState().clearSecrets();
	}, []);
	return (
		<div className="min-w-0 space-y-6">
			<PageHeader
				title="数据源"
				description="连接电脑活动、公开文章与 GitHub，按天读入时间线和日记。"
			/>
			{state.error ? (
				<Banner
					variant="error"
					title="数据源操作失败"
					description={state.error}
					action={
						state.status === "error" ? (
							<Banner.Action onClick={() => void state.load()}>重试</Banner.Action>
						) : undefined
					}
				/>
			) : null}
			{state.connection ? (
				<Banner
					variant={state.connection.success ? "default" : "error"}
					title={`${DAY_SOURCE_NAMES[state.connection.provider]} ${state.connection.success ? "连接成功" : "读取失败"}`}
					description={
						state.connection.success
							? `${state.connection.date}：${state.connection.eventCount} ${state.connection.provider === "gecko" ? "个小时有电脑活动" : "篇公开文章"}。`
							: state.connection.message
					}
				/>
			) : null}
			{state.settings.length === 0 && (state.status === "idle" || state.status === "loading") ? (
				<DaySourcesSkeleton />
			) : state.settings.length > 0 ? (
				<div className="grid min-w-0 gap-6 xl:grid-cols-2">
					{DAY_SOURCE_PROVIDERS.map((provider) => {
						const setting = state.settings.find((value) => value.provider === provider);
						const enabled = setting?.enabled === true;
						const Icon =
							provider === "github" ? GitFork : provider === "gecko" ? Monitor : Newspaper;
						const needsKey = provider !== "firefly";
						const keyLabel = provider === "github" ? "GitHub PAT" : "Gecko API Key";
						return (
							<LayerCard key={provider} data-day-source={provider}>
								<LayerCard.Header className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-3">
										<Icon size={20} aria-hidden="true" />
										<Text as="h2" variant="heading" size="md">
											{DAY_SOURCE_NAMES[provider]}
										</Text>
									</div>
									<Badge variant={enabled ? "success" : "secondary"}>
										{enabled ? "已启用" : "未启用"}
									</Badge>
								</LayerCard.Header>
								<LayerCard.Body className="space-y-4">
									<p className="text-sm leading-relaxed text-basalt-muted-foreground">
										{provider === "gecko"
											? "汇总每小时的电脑活动、应用与窗口内容，自动隐藏闲置、锁屏和屏保。"
											: provider === "github"
												? "随当天页面选择的日期，自动读取该账号的 Commit、PR、Issue 和 Release，保留动作时间与完整说明。"
												: "读取 lizheng.blog 当天公开发表的文章，展示封面、摘要、作者和发表时间。"}
									</p>
									{setting?.account ? (
										<p className="text-sm">已连接 @{setting.account.login}</p>
									) : null}
									{needsKey ? (
										<Field
											label={keyLabel}
											htmlFor={`${provider}-api-key`}
											hint={
												setting?.hasApiKey
													? "已加密保存。留空可保留现有密钥。"
													: provider === "github"
														? "填写已有 PAT，仅用于读取其获准访问的仓库。"
														: "从 Gecko 的 API 集成页创建密钥。"
											}
										>
											<SensitiveInput
												id={`${provider}-api-key`}
												value={state.apiKeys[provider]}
												onChange={(event) => state.setApiKey(provider, event.target.value)}
												autoComplete="off"
												placeholder={
													setting?.hasApiKey
														? "已保存"
														: provider === "github"
															? "填写已有 PAT"
															: "gk_…"
												}
												revealLabel={provider === "github" ? "显示 GitHub PAT" : "显示 Gecko 密钥"}
												hideLabel={provider === "github" ? "隐藏 GitHub PAT" : "隐藏 Gecko 密钥"}
												disabled={Boolean(state.busy)}
											/>
										</Field>
									) : (
										<p className="text-sm text-basalt-muted-foreground">
											公开数据，无须账号或密钥。
										</p>
									)}
									{provider === "github" ? (
										<p className="text-sm leading-relaxed text-basalt-muted-foreground">
											Commits 使用 GitHub 搜索收录的默认分支提交，按作者时间归属。私有仓库需 PAT
											授权。PR、Issue 包含该账号创建的条目当天的动作；Release
											来自有访问权限的自有、协作及组织仓库，按该账号署名的版本发布时间归属。
											同一账号和日期在当前时区首次查询后保存结果（包括空日），之后不自动刷新。移除连接会删除
											PAT，保留已查询记录。
										</p>
									) : null}
									<div className="flex flex-wrap gap-2">
										<Button
											onClick={() => void state.save(provider, true)}
											disabled={
												state.status !== "ready" ||
												Boolean(state.busy) ||
												(needsKey && !state.apiKeys[provider].trim() && !setting?.hasApiKey)
											}
										>
											{enabled ? "保存配置" : `添加 ${DAY_SOURCE_NAMES[provider]}`}
										</Button>
										{enabled ? (
											<>
												{provider !== "github" ? (
													<Button
														variant="outline"
														onClick={() => void state.test(provider)}
														disabled={
															Boolean(state.busy) ||
															(needsKey && Boolean(state.apiKeys[provider].trim()))
														}
													>
														测试连接
													</Button>
												) : null}
												<Button
													variant="ghost"
													onClick={() => void state.save(provider, false)}
													disabled={Boolean(state.busy)}
												>
													停用
												</Button>
											</>
										) : null}
										{enabled || setting?.hasApiKey ? (
											<Button
												variant="ghost"
												onClick={() => void state.remove(provider)}
												disabled={Boolean(state.busy)}
												aria-label={`移除 ${DAY_SOURCE_NAMES[provider]}`}
											>
												移除
											</Button>
										) : null}
									</div>
									{state.busy === provider ? (
										<p role="status" className="text-sm text-basalt-muted-foreground">
											正在处理…
										</p>
									) : null}
								</LayerCard.Body>
							</LayerCard>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
