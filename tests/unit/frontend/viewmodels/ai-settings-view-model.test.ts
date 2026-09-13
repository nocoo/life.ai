import { beforeEach, describe, expect, it, vi } from "vitest";
import { abortError } from "../helpers";

vi.mock("../../../../src/services/ai-service", () => ({
	fetchAiSettings: vi.fn(),
	saveAiSettings: vi.fn(),
	testSavedAiConnection: vi.fn(),
}));

import { DEFAULT_AI_MODEL } from "../../../../src/models/ai";
import {
	fetchAiSettings,
	saveAiSettings,
	testSavedAiConnection,
} from "../../../../src/services/ai-service";
import { ApiError } from "../../../../src/services/http";
import {
	aiProviderOptions,
	aiSettingsStore,
	buildAiSettingsInput,
	isCustomProvider,
	modelsForProvider,
	providerNeedsApiKey,
	WORKERS_AI_PROVIDER,
} from "../../../../src/viewmodels/ai-settings-view-model";

const fetchMock = vi.mocked(fetchAiSettings);
const saveMock = vi.mocked(saveAiSettings);
const testMock = vi.mocked(testSavedAiConnection);

const saved = {
	provider: WORKERS_AI_PROVIDER,
	model: DEFAULT_AI_MODEL,
	baseURL: "",
	sdkType: "openai" as const,
	authType: "apiKey" as const,
	hasApiKey: false,
	configured: true,
};

describe("ai settings helpers", () => {
	it("treats Workers AI as keyless and omits an unchanged key", () => {
		expect(providerNeedsApiKey(WORKERS_AI_PROVIDER)).toBe(false);
		expect(providerNeedsApiKey("anthropic")).toBe(true);
		expect(isCustomProvider("custom")).toBe(true);
		expect(modelsForProvider(WORKERS_AI_PROVIDER)).toEqual([DEFAULT_AI_MODEL]);
		expect(
			buildAiSettingsInput({
				provider: WORKERS_AI_PROVIDER,
				model: DEFAULT_AI_MODEL,
				baseURL: "",
				sdkType: "openai",
				authType: "apiKey",
				apiKey: "  ",
			}),
		).not.toHaveProperty("apiKey");
		expect(
			buildAiSettingsInput({
				provider: WORKERS_AI_PROVIDER,
				model: DEFAULT_AI_MODEL,
				baseURL: "",
				sdkType: "openai",
				authType: "apiKey",
				apiKey: " secret ",
			}).apiKey,
		).toBe("secret");
		expect(aiProviderOptions().some((option) => option.id === WORKERS_AI_PROVIDER)).toBe(true);
		expect(modelsForProvider("unknown-provider")).toEqual([]);
		expect(
			buildAiSettingsInput({
				provider: "custom",
				model: "  ",
				baseURL: " https://example.test ",
				sdkType: "anthropic",
				authType: "bearer",
				apiKey: "",
			}),
		).toMatchObject({
			provider: "custom",
			model: DEFAULT_AI_MODEL,
			baseURL: "https://example.test",
			sdkType: "anthropic",
		});
	});
});

describe("aiSettingsStore", () => {
	beforeEach(() => {
		aiSettingsStore.getState().reset();
		fetchMock.mockReset();
		saveMock.mockReset();
		testMock.mockReset();
	});

	it("loads saved settings into the draft", async () => {
		fetchMock.mockResolvedValue(saved);
		await aiSettingsStore.getState().load();
		expect(aiSettingsStore.getState()).toMatchObject({
			status: "ready",
			settings: saved,
			draft: { provider: WORKERS_AI_PROVIDER, apiKey: "" },
		});
	});

	it("marks expiry instead of retrying forever", async () => {
		fetchMock.mockRejectedValue(new ApiError(401, "unauthorized", "expired"));
		await aiSettingsStore.getState().load();
		expect(aiSettingsStore.getState()).toMatchObject({ status: "error", expired: true });
	});

	it("saves the full input and tests the saved config", async () => {
		fetchMock.mockResolvedValue(saved);
		await aiSettingsStore.getState().load();
		saveMock.mockResolvedValue({ ...saved, model: DEFAULT_AI_MODEL });
		await aiSettingsStore.getState().save();
		expect(saveMock).toHaveBeenCalledWith(
			expect.objectContaining({ provider: WORKERS_AI_PROVIDER, model: DEFAULT_AI_MODEL }),
		);
		expect(saveMock.mock.calls[0]?.[0]).not.toHaveProperty("apiKey");
		testMock.mockResolvedValue({
			success: true,
			response: "pong",
			provider: WORKERS_AI_PROVIDER,
			model: DEFAULT_AI_MODEL,
		});
		await aiSettingsStore.getState().testSaved();
		expect(aiSettingsStore.getState().testResult?.success).toBe(true);
	});

	it("keeps a test failure message", async () => {
		testMock.mockRejectedValue(new Error("bad key"));
		await aiSettingsStore.getState().testSaved();
		expect(aiSettingsStore.getState().testError).toBe("bad key");
	});

	it("ignores aborted loads", async () => {
		fetchMock.mockRejectedValue(abortError());
		await aiSettingsStore.getState().load();
		expect(aiSettingsStore.getState().status).toBe("loading");
	});

	it("selects builtin and custom providers", () => {
		aiSettingsStore.getState().selectProvider("anthropic");
		expect(aiSettingsStore.getState().draft.provider).toBe("anthropic");
		expect(aiSettingsStore.getState().draft.model.length).toBeGreaterThan(0);
		aiSettingsStore.getState().selectProvider("custom");
		expect(aiSettingsStore.getState().draft.provider).toBe("custom");
		aiSettingsStore.getState().selectProvider(WORKERS_AI_PROVIDER);
		expect(aiSettingsStore.getState().draft.model).toBe(DEFAULT_AI_MODEL);
	});

	it("does not start a second save or test", async () => {
		let finishSave: () => void = () => {};
		saveMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					finishSave = () => resolve(saved);
				}),
		);
		const firstSave = aiSettingsStore.getState().save();
		await aiSettingsStore.getState().save();
		expect(saveMock).toHaveBeenCalledTimes(1);
		finishSave();
		await firstSave;
		let finishTest: () => void = () => {};
		testMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					finishTest = () =>
						resolve({
							success: false,
							response: "nope",
							provider: WORKERS_AI_PROVIDER,
							model: DEFAULT_AI_MODEL,
						});
				}),
		);
		const firstTest = aiSettingsStore.getState().testSaved();
		await aiSettingsStore.getState().testSaved();
		expect(testMock).toHaveBeenCalledTimes(1);
		finishTest();
		await firstTest;
		expect(aiSettingsStore.getState().testError).toBe("nope");
	});

	it("maps save and test abort or auth failures", async () => {
		saveMock.mockRejectedValue(abortError());
		await aiSettingsStore.getState().save();
		expect(aiSettingsStore.getState().saving).toBe(false);
		saveMock.mockRejectedValue(new ApiError(403, "forbidden", "denied"));
		await aiSettingsStore.getState().save();
		expect(aiSettingsStore.getState().expired).toBe(true);
		testMock.mockRejectedValue(abortError());
		await aiSettingsStore.getState().testSaved();
		expect(aiSettingsStore.getState().testing).toBe(false);
		fetchMock.mockResolvedValue(saved);
		await aiSettingsStore.getState().retry();
		expect(aiSettingsStore.getState().status).toBe("ready");
	});

	it("applies draft patches", () => {
		aiSettingsStore.getState().setDraft({ model: "other" });
		expect(aiSettingsStore.getState().draft.model).toBe("other");
	});
});
