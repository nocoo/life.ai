import {
	Badge,
	Button,
	ConfirmDialog,
	DescriptionList,
	Field,
	Input,
	LayerCard,
	Text,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { ClipboardText } from "@nocoo/basalt/components/clipboard-text";
import { CodeBlock } from "@nocoo/basalt/components/code";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { ConnectListSkeleton } from "../components/page-skeletons";
import type { Connect } from "../models/types";
import { CONNECT_NAME_MAX, connectStore, INGEST_URL } from "../viewmodels/connect-view-model";
import { formatAbsoluteTime } from "../viewmodels/format";

function ConnectRow({
	connect,
	revokingId,
	onRevoke,
}: {
	connect: Connect;
	revokingId: string | null;
	onRevoke: (id: string) => void;
}) {
	const revoked = Boolean(connect.revokedAt);
	return (
		<LayerCard.Well>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<Text as="p" bold>
							{connect.name}
						</Text>
						<Badge variant={revoked ? "secondary" : "success"}>{revoked ? "已撤销" : "有效"}</Badge>
					</div>
					<Text as="p" size="sm" tone="muted">
						前缀 {connect.prefix} · 记录 {connect.recordCount}
					</Text>
				</div>
				{revoked ? null : (
					<Button
						variant="destructive"
						size="sm"
						loading={revokingId === connect.id}
						disabled={Boolean(revokingId)}
						onClick={() => onRevoke(connect.id)}
					>
						撤销
					</Button>
				)}
			</div>
			<DescriptionList columns={2} className="mt-3">
				<DescriptionList.Item term="创建时间">
					{formatAbsoluteTime(connect.createdAt)}
				</DescriptionList.Item>
				<DescriptionList.Item term="最近使用">
					{formatAbsoluteTime(connect.lastUsedAt)}
				</DescriptionList.Item>
				<DescriptionList.Item term="撤销时间">
					{formatAbsoluteTime(connect.revokedAt)}
				</DescriptionList.Item>
			</DescriptionList>
		</LayerCard.Well>
	);
}

export function ConnectPage() {
	const connects = useStore(connectStore, (state) => state.connects);
	const status = useStore(connectStore, (state) => state.status);
	const error = useStore(connectStore, (state) => state.error);
	const nameDraft = useStore(connectStore, (state) => state.nameDraft);
	const nameError = useStore(connectStore, (state) => state.nameError);
	const creating = useStore(connectStore, (state) => state.creating);
	const revokingId = useStore(connectStore, (state) => state.revokingId);
	const createdSecret = useStore(connectStore, (state) => state.createdSecret);
	const [pendingRevoke, setPendingRevoke] = useState<Connect | null>(null);

	useEffect(() => {
		void connectStore.getState().load();
	}, []);

	return (
		<div className="min-w-0 space-y-6">
			<PageHeader
				title="Connect"
				description="只写令牌，明文只出现一次。同一 UTC 小时再次写入会替换该小时；未来小时有效。"
			/>
			{createdSecret ? (
				<LayerCard outlined>
					<LayerCard.Header>
						<Text as="h2" variant="heading" size="md">
							请立即保存令牌
						</Text>
						<Text as="p" size="sm" tone="muted">
							{createdSecret.name} 的明文只显示这一次。关闭后无法再次查看。
						</Text>
					</LayerCard.Header>
					<LayerCard.Body className="space-y-3">
						<Banner
							variant="alert"
							title="请复制后自行保管"
							description="关闭后无法再次查看明文。"
						/>
						<Field label="令牌">
							<ClipboardText text={createdSecret.token} />
						</Field>
						<Field label="curl 示例" hint={INGEST_URL}>
							<ClipboardText text={createdSecret.curl} />
							<CodeBlock className="mt-2 overflow-x-auto">{createdSecret.curl}</CodeBlock>
						</Field>
						<Button variant="outline" onClick={() => connectStore.getState().dismissSecret()}>
							我已保存
						</Button>
					</LayerCard.Body>
				</LayerCard>
			) : null}
			<LayerCard>
				<LayerCard.Header>
					<Text as="h2" variant="heading" size="md">
						签发令牌
					</Text>
				</LayerCard.Header>
				<LayerCard.Body>
					<form
						className="flex max-w-xl flex-col gap-3"
						onSubmit={(event) => {
							event.preventDefault();
							void connectStore.getState().create();
						}}
					>
						<Field
							label="名称"
							htmlFor="connect-name"
							hint={`最多 ${CONNECT_NAME_MAX} 个字符，用于辨认发布者。`}
							error={nameError ?? undefined}
							required
						>
							<Input
								id="connect-name"
								value={nameDraft}
								maxLength={CONNECT_NAME_MAX}
								autoComplete="off"
								passwordManagerIgnore
								placeholder="例如 Mac mini"
								onChange={(event) => connectStore.getState().setNameDraft(event.target.value)}
							/>
						</Field>
						<Button type="submit" loading={creating}>
							创建令牌
						</Button>
					</form>
				</LayerCard.Body>
			</LayerCard>
			{status === "error" ? (
				<Banner
					variant="error"
					title="无法加载 Connect"
					description={error ?? "请重试。"}
					action={
						<Banner.Action onClick={() => void connectStore.getState().retry()}>重试</Banner.Action>
					}
				/>
			) : null}
			{error && status !== "error" ? (
				<Banner variant="error" title="操作失败" description={error} />
			) : null}
			<LayerCard>
				<LayerCard.Header>
					<Text as="h2" variant="heading" size="md">
						已签发
					</Text>
				</LayerCard.Header>
				<LayerCard.Body className="space-y-3">
					{(status === "idle" || status === "loading") && connects.length === 0 ? (
						<ConnectListSkeleton />
					) : null}
					{status === "ready" && connects.length === 0 ? (
						<LayerCard.Empty
							title="还没有令牌"
							description="创建一个只写令牌，从机器按小时写入。"
						/>
					) : null}
					{connects.map((connect) => (
						<ConnectRow
							key={connect.id}
							connect={connect}
							revokingId={revokingId}
							onRevoke={(id) => {
								const target = connects.find((item) => item.id === id) ?? null;
								setPendingRevoke(target);
							}}
						/>
					))}
				</LayerCard.Body>
			</LayerCard>
			<ConfirmDialog
				open={pendingRevoke !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPendingRevoke(null);
					}
				}}
				title="撤销令牌？"
				description="撤销后无法再用此令牌写入。历史记录会保留。"
				confirmLabel="撤销"
				cancelLabel="取消"
				variant="destructive"
				loading={Boolean(revokingId)}
				onConfirm={() => {
					if (!pendingRevoke) {
						return;
					}
					const id = pendingRevoke.id;
					setPendingRevoke(null);
					void connectStore.getState().revoke(id);
				}}
			/>
		</div>
	);
}
