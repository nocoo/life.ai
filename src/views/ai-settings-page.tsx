import { Button, Field, Input, LayerCard, Text } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import { SensitiveInput } from "@nocoo/basalt/components/sensitive-input";
import { useEffect } from "react";
import { useStore } from "zustand";
import { AiSettingsSkeleton } from "../components/page-skeletons";
import {
	aiProviderOptions,
	aiSettingsStore,
	isCustomProvider,
	modelsForProvider,
	providerNeedsApiKey,
} from "../viewmodels/ai-settings-view-model";

export function AiSettingsPage() {
	const settings = useStore(aiSettingsStore, (state) => state.settings);
	const draft = useStore(aiSettingsStore, (state) => state.draft);
	const status = useStore(aiSettingsStore, (state) => state.status);
	const error = useStore(aiSettingsStore, (state) => state.error);
	const expired = useStore(aiSettingsStore, (state) => state.expired);
	const saving = useStore(aiSettingsStore, (state) => state.saving);
	const testing = useStore(aiSettingsStore, (state) => state.testing);
	const testResult = useStore(aiSettingsStore, (state) => state.testResult);
	const testError = useStore(aiSettingsStore, (state) => state.testError);
	const models = modelsForProvider(draft.provider);
	const custom = isCustomProvider(draft.provider);
	const needsKey = providerNeedsApiKey(draft.provider);
	const loading = !settings && (status === "idle" || status === "loading");

	useEffect(() => {
		void aiSettingsStore.getState().load();
	}, []);

	return (
		<div className="min-w-0 space-y-6">
			<PageHeader
				title="AI 设置"
				description="默认使用 Cloudflare Workers AI，不必填写密钥。测试连接使用已保存的配置。"
			/>
			{status === "error" ? (
				<Banner
					variant="error"
					title={expired ? "会话已过期" : "无法读取设置"}
					description={expired ? "请重新登录后再试。" : (error ?? "请重试。")}
					action={
						expired ? (
							<Banner.Action onClick={() => window.location.reload()}>重新登录</Banner.Action>
						) : (
							<Banner.Action onClick={() => void aiSettingsStore.getState().retry()}>
								重试
							</Banner.Action>
						)
					}
				/>
			) : null}
			{error && status !== "error" ? (
				<Banner variant="error" title="保存失败" description={error} />
			) : null}
			<LayerCard>
				<LayerCard.Header>
					<Text as="h2" variant="heading" size="md">
						模型
					</Text>
				</LayerCard.Header>
				<LayerCard.Body className="max-w-xl space-y-4">
					{loading ? (
						<AiSettingsSkeleton />
					) : settings ? (
						<>
							<Field label="提供方" htmlFor="ai-provider">
								<Select
									value={draft.provider}
									onValueChange={(value) => aiSettingsStore.getState().selectProvider(value)}
								>
									<SelectTrigger id="ai-provider" aria-label="AI 提供方">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{aiProviderOptions().map((option) => (
											<SelectItem key={option.id} value={option.id}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
							{models.length > 0 && !custom ? (
								<Field label="模型" htmlFor="ai-model">
									<Select
										value={draft.model}
										onValueChange={(value) => aiSettingsStore.getState().setDraft({ model: value })}
									>
										<SelectTrigger id="ai-model" aria-label="模型">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{models.map((model) => (
												<SelectItem key={model} value={model}>
													{model}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							) : (
								<Field label="模型" htmlFor="ai-model-input">
									<Input
										id="ai-model-input"
										value={draft.model}
										onChange={(event) =>
											aiSettingsStore.getState().setDraft({ model: event.target.value })
										}
									/>
								</Field>
							)}
							{custom ? (
								<>
									<Field label="Base URL" htmlFor="ai-base-url">
										<Input
											id="ai-base-url"
											value={draft.baseURL}
											onChange={(event) =>
												aiSettingsStore.getState().setDraft({ baseURL: event.target.value })
											}
										/>
									</Field>
									<Field label="SDK" htmlFor="ai-sdk">
										<Select
											value={draft.sdkType}
											onValueChange={(value) =>
												aiSettingsStore.getState().setDraft({
													sdkType: value as "openai" | "anthropic",
												})
											}
										>
											<SelectTrigger id="ai-sdk" aria-label="SDK">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="openai">OpenAI</SelectItem>
												<SelectItem value="anthropic">Anthropic</SelectItem>
											</SelectContent>
										</Select>
									</Field>
									<Field label="鉴权" htmlFor="ai-auth">
										<Select
											value={draft.authType}
											onValueChange={(value) =>
												aiSettingsStore.getState().setDraft({
													authType: value as "apiKey" | "bearer",
												})
											}
										>
											<SelectTrigger id="ai-auth" aria-label="鉴权">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="apiKey">API Key</SelectItem>
												<SelectItem value="bearer">Bearer</SelectItem>
											</SelectContent>
										</Select>
									</Field>
								</>
							) : null}
							{needsKey ? (
								<Field
									label="API Key"
									htmlFor="ai-key"
									hint={
										settings?.hasApiKey
											? "留空则保留已保存的密钥。"
											: "Workers AI 以外的提供方需要密钥。"
									}
								>
									<SensitiveInput
										id="ai-key"
										value={draft.apiKey}
										revealLabel="显示密钥"
										hideLabel="隐藏密钥"
										passwordManagerIgnore
										onChange={(event) =>
											aiSettingsStore.getState().setDraft({ apiKey: event.target.value })
										}
									/>
								</Field>
							) : (
								<Text as="p" size="sm" tone="muted">
									Workers AI 使用本机绑定，不需要 API Key。
								</Text>
							)}
							<div className="flex flex-wrap gap-2">
								<Button onClick={() => void aiSettingsStore.getState().save()} loading={saving}>
									保存
								</Button>
								<Button
									variant="outline"
									onClick={() => void aiSettingsStore.getState().testSaved()}
									loading={testing}
									disabled={!settings}
								>
									测试已保存的配置
								</Button>
							</div>
							{testResult?.success ? (
								<Banner variant="default" title="连接成功" description={testResult.response} />
							) : null}
							{testError ? (
								<Banner variant="error" title="连接失败" description={testError} />
							) : null}
						</>
					) : null}
				</LayerCard.Body>
			</LayerCard>
		</div>
	);
}
