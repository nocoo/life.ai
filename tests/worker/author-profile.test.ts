import { describe, expect, it } from "vitest";
import {
	AUTHOR_PROFILE_ENDPOINT,
	fetchAuthorProfile,
	hashEmail,
	normalizeEmail,
} from "../../worker/author-profile.js";

const KNOWN_EMAIL = "architie@gmail.com";
const KNOWN_HASH = "7ba563171c26fb9b82e9f7750840c0455602eb35025192027230bcb40aae1217";

describe("worker/author-profile", () => {
	describe("normalizeEmail / hashEmail", () => {
		it("trims and lowercases email", () => {
			expect(normalizeEmail("  Architie@Gmail.com  ")).toBe(KNOWN_EMAIL);
			expect(normalizeEmail("user@example.com")).toBe("user@example.com");
		});

		it("computes SHA-256 of UTF-8 normalized email as 64-char lowercase hex", async () => {
			const hash = await hashEmail(KNOWN_EMAIL);
			expect(hash).toBe(KNOWN_HASH);
			expect(hash).toMatch(/^[0-9a-f]{64}$/);
		});

		it("applies normalization before hashing", async () => {
			expect(await hashEmail("  ARCHITIE@GMAIL.COM\n")).toBe(KNOWN_HASH);
		});
	});

	describe("fetchAuthorProfile", () => {
		it("returns empty profile for empty or whitespace-only email", async () => {
			await expect(fetchAuthorProfile("")).resolves.toEqual({ name: null, avatar: null });
			await expect(fetchAuthorProfile("   ")).resolves.toEqual({ name: null, avatar: null });
		});

		it("GETs the profile endpoint with the SHA-256 hash and returns valid profile", async () => {
			const fetchFn = async (input: RequestInfo | URL) => {
				expect(String(input)).toBe(`${AUTHOR_PROFILE_ENDPOINT}?hash=${KNOWN_HASH}`);
				return new Response(
					JSON.stringify({ name: "Zheng Li", avatar: "https://img.example/avatar.png" }),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			};

			const profile = await fetchAuthorProfile(KNOWN_EMAIL, fetchFn);
			expect(profile).toEqual({
				name: "Zheng Li",
				avatar: "https://img.example/avatar.png",
			});
		});

		it("rejects non-HTTPS avatar URLs for security", async () => {
			const fetchFn = async () => {
				return new Response(
					JSON.stringify({
						name: "Zheng Li",
						avatar: "http://insecure.example/avatar.png",
					}),
					{ status: 200 },
				);
			};

			const profile = await fetchAuthorProfile(KNOWN_EMAIL, fetchFn);
			expect(profile).toEqual({
				name: "Zheng Li",
				avatar: null,
			});

			const fetchFnJs = async () => {
				return new Response(
					JSON.stringify({
						name: "Zheng Li",
						avatar: "javascript:alert(1)",
					}),
					{ status: 200 },
				);
			};
			const profileJs = await fetchAuthorProfile(KNOWN_EMAIL, fetchFnJs);
			expect(profileJs.avatar).toBeNull();

			const fetchFnMalformed = async () => {
				return new Response(
					JSON.stringify({
						name: "Zheng Li",
						avatar: "http://[",
					}),
					{ status: 200 },
				);
			};
			const profileMal = await fetchAuthorProfile(KNOWN_EMAIL, fetchFnMalformed);
			expect(profileMal.avatar).toBeNull();
		});

		it("returns empty profile on non-200 responses", async () => {
			const fetchFn404 = async () => new Response("Not found", { status: 404 });
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFn404)).resolves.toEqual({
				name: null,
				avatar: null,
			});

			const fetchFn429 = async () => new Response("Rate limited", { status: 429 });
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFn429)).resolves.toEqual({
				name: null,
				avatar: null,
			});

			const fetchFn500 = async () => new Response("Server error", { status: 500 });
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFn500)).resolves.toEqual({
				name: null,
				avatar: null,
			});
		});

		it("returns empty profile on network failure or timeout", async () => {
			const fetchFnFail = async () => {
				throw new Error("DNS failure");
			};
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFnFail)).resolves.toEqual({
				name: null,
				avatar: null,
			});
		});

		it("returns empty profile on malformed JSON or empty body", async () => {
			const fetchFnBadJson = async () => new Response("not-json", { status: 200 });
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFnBadJson)).resolves.toEqual({
				name: null,
				avatar: null,
			});

			const fetchFnEmpty = async () => new Response("", { status: 200 });
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFnEmpty)).resolves.toEqual({
				name: null,
				avatar: null,
			});

			const fetchFnNoBody = async () => new Response(null, { status: 200 });
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFnNoBody)).resolves.toEqual({
				name: null,
				avatar: null,
			});
		});

		it("returns empty profile if Content-Length exceeds bounded size", async () => {
			const fetchFnTooBig = async () =>
				new Response(JSON.stringify({ name: "A" }), {
					status: 200,
					headers: { "Content-Length": "100000" },
				});
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFnTooBig)).resolves.toEqual({
				name: null,
				avatar: null,
			});
		});

		it("returns empty profile if streamed response exceeds bounded size", async () => {
			const largeString = "a".repeat(20 * 1024);
			const fetchFnStreamedBig = async () =>
				new Response(largeString, {
					status: 200,
				});
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFnStreamedBig)).resolves.toEqual({
				name: null,
				avatar: null,
			});
		});

		it("requests the profile without following redirects and with a timeout", async () => {
			let init: RequestInit | undefined;
			const fetchFn = async (_input: RequestInfo | URL, requestInit?: RequestInit) => {
				init = requestInit;
				return new Response(
					JSON.stringify({ name: "Zheng Li", avatar: "https://img.example/a.png" }),
					{
						status: 200,
					},
				);
			};
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFn)).resolves.toEqual({
				name: "Zheng Li",
				avatar: "https://img.example/a.png",
			});
			expect(init?.redirect).toBe("manual");
			expect(init?.signal).toBeInstanceOf(AbortSignal);
			expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
		});

		it("does not follow 3xx or leak the email hash to a Location hop", async () => {
			const urls: string[] = [];
			const fetchFn = async (input: RequestInfo | URL, requestInit?: RequestInit) => {
				urls.push(String(input));
				expect(requestInit?.redirect).toBe("manual");
				return new Response("redirect-body", {
					status: 302,
					headers: { Location: "https://evil.example/steal" },
				});
			};
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFn)).resolves.toEqual({
				name: null,
				avatar: null,
			});
			expect(urls).toEqual([`${AUTHOR_PROFILE_ENDPOINT}?hash=${KNOWN_HASH}`]);
		});

		it("rejects HTTPS avatars that embed credentials", async () => {
			const fetchFn = async () =>
				new Response(
					JSON.stringify({
						name: "Zheng Li",
						avatar: "https://user:pass@img.example/avatar.png",
					}),
					{ status: 200 },
				);
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFn)).resolves.toEqual({
				name: "Zheng Li",
				avatar: null,
			});
		});

		it("returns empty profile when fetch refuses a redirect", async () => {
			const fetchFn = async () => {
				throw new TypeError("redirect");
			};
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFn)).resolves.toEqual({
				name: null,
				avatar: null,
			});
		});

		it("treats non-object or missing fields as null", async () => {
			const fetchFnArray = async () => new Response(JSON.stringify([]), { status: 200 });
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFnArray)).resolves.toEqual({
				name: null,
				avatar: null,
			});

			const fetchFnPrimitive = async () => new Response(JSON.stringify("string"), { status: 200 });
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFnPrimitive)).resolves.toEqual({
				name: null,
				avatar: null,
			});

			const fetchFnNulls = async () =>
				new Response(JSON.stringify({ name: null, avatar: null }), { status: 200 });
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFnNulls)).resolves.toEqual({
				name: null,
				avatar: null,
			});

			const fetchFnBlankStrings = async () =>
				new Response(JSON.stringify({ name: "   ", avatar: "" }), { status: 200 });
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFnBlankStrings)).resolves.toEqual({
				name: null,
				avatar: null,
			});

			const fetchFnWrongTypes = async () =>
				new Response(JSON.stringify({ name: 12, avatar: true }), { status: 200 });
			await expect(fetchAuthorProfile(KNOWN_EMAIL, fetchFnWrongTypes)).resolves.toEqual({
				name: null,
				avatar: null,
			});
		});
	});
});
