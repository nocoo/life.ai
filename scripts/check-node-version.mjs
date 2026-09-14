#!/usr/bin/env node
// Package-manager-agnostic Node runtime check.
//
// Bun does not enforce package.json engines consistently, so every runnable
// package command invokes this guard before loading tools or native modules.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function parseNodeVersion(value) {
	if (typeof value !== "string") {
		throw new TypeError("Node version must be a string");
	}

	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
		value.trim(),
	);
	if (!match) {
		throw new Error(`Node version "${value}" is not a valid semantic version`);
	}

	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4] ?? null,
	};
}

function compareNodeVersions(left, right) {
	for (const key of ["major", "minor", "patch"]) {
		if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
	}
	return 0;
}

function parseRangeClause(clause) {
	const match = /^(\^|>=)(\d+)\.(\d+)\.(\d+)$/.exec(clause.trim());
	if (!match) {
		throw new Error(`unsupported engines.node clause: "${clause}". Expected ^N.N.N or >=N.N.N.`);
	}

	return {
		operator: match[1],
		version: { major: Number(match[2]), minor: Number(match[3]), patch: Number(match[4]) },
	};
}

export function isNodeVersionSupported(nodeVersion, range) {
	if (typeof range !== "string" || !range.trim()) {
		throw new TypeError("engines.node must be a non-empty string");
	}

	const current = parseNodeVersion(nodeVersion);
	if (current.prerelease) return false;
	return range.split("||").some((rawClause) => {
		const { operator, version } = parseRangeClause(rawClause);
		if (operator === ">=") return compareNodeVersions(current, version) >= 0;

		return current.major === version.major && compareNodeVersions(current, version) >= 0;
	});
}

function checkNodeVersion() {
	const rootPkg = JSON.parse(readFileSync(resolve(here, "..", "package.json"), "utf-8"));
	const requiredRange = rootPkg.engines?.node;
	if (!requiredRange) {
		console.error("[check-node-version] package.json engines.node is missing — refusing to run.");
		process.exitCode = 2;
		return;
	}

	try {
		if (isNodeVersionSupported(process.versions.node, requiredRange)) return;
	} catch (error) {
		console.error(`[check-node-version] ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 2;
		return;
	}

	console.error(
		`[check-node-version] FAIL: Node ${process.version} is outside the supported range "${requiredRange}". ` +
			"See .node-version and package.json#engines.",
	);
	process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	checkNodeVersion();
}
