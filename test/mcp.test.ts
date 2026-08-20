import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { handleLspMcpRequest, runMcpStdioServer } from "../src/mcp.js";

describe("lsp MCP server", () => {
	it("responds to initialize with tool capabilities", async () => {
		const response = await handleLspMcpRequest({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "test", version: "0.0.0" },
			},
		});

		expect(response).toMatchObject({
			jsonrpc: "2.0",
			id: 1,
			result: {
				capabilities: { tools: { listChanged: false } },
				serverInfo: { name: "lsp", version: "0.1.0" },
			},
		});
	});

	it("lists LSP MCP tools", async () => {
		const response = await handleLspMcpRequest({
			jsonrpc: "2.0",
			id: 2,
			method: "tools/list",
		});

		const tools = response?.result?.tools as Array<{ name: string }>;
		expect(tools.map((tool) => tool.name)).toEqual([
			"status",
			"diagnostics",
			"goto_definition",
			"find_references",
			"symbols",
			"prepare_rename",
			"rename",
		]);
	});

	it("calls status without starting a language server", async () => {
		const response = await handleLspMcpRequest({
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: { name: "status", arguments: {} },
		});

		expect(response).toMatchObject({
			jsonrpc: "2.0",
			id: 3,
			result: {
				isError: false,
			},
		});
		expect(response?.result?.content?.[0]?.text).toContain("Configured LSP servers");
	});

	it("accepts legacy lsp-prefixed tool names without listing them", async () => {
		const response = await handleLspMcpRequest({
			jsonrpc: "2.0",
			id: 4,
			method: "tools/call",
			params: { name: "lsp_status", arguments: {} },
		});

		expect(response).toMatchObject({
			jsonrpc: "2.0",
			id: 4,
			result: {
				isError: false,
			},
		});
		expect(response?.result?.content?.[0]?.text).toContain("Configured LSP servers");
	});

	it("#given idle stdio connection #when a request arrives after ten minutes #then server responds", async () => {
		vi.useFakeTimers();
		const input = new PassThrough();
		const output = new PassThrough();
		const received: string[] = [];
		let legacyIdleCallbackCalls = 0;
		output.on("data", (chunk) => received.push(String(chunk)));
		const server = runMcpStdioServer(input, output, {
			idleTimeoutMs: 1,
			onIdleTimeout: () => {
				legacyIdleCallbackCalls++;
			},
		});

		try {
			await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
			input.write(
				`${JSON.stringify({
					jsonrpc: "2.0",
					id: 5,
					method: "tools/call",
					params: { name: "status", arguments: {} },
				})}\n`,
			);
			input.end();
			await server;

			expect(received.join("")).toContain('"id":5');
			expect(received.join("")).toContain("Configured LSP servers");
			expect(legacyIdleCallbackCalls).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("#given two stdio connections #when both receive requests #then they respond independently", async () => {
		const firstInput = new PassThrough();
		const firstOutput = new PassThrough();
		const secondInput = new PassThrough();
		const secondOutput = new PassThrough();
		const firstReceived: string[] = [];
		const secondReceived: string[] = [];
		firstOutput.on("data", (chunk) => firstReceived.push(String(chunk)));
		secondOutput.on("data", (chunk) => secondReceived.push(String(chunk)));
		const firstServer = runMcpStdioServer(firstInput, firstOutput);
		const secondServer = runMcpStdioServer(secondInput, secondOutput);

		firstInput.end(`${JSON.stringify(initializeRequest(11, "first-client"))}\n`);
		secondInput.end(`${JSON.stringify(initializeRequest(22, "second-client"))}\n`);
		await Promise.all([firstServer, secondServer]);

		expect(firstReceived.join("")).toContain('"id":11');
		expect(firstReceived.join("")).not.toContain('"id":22');
		expect(secondReceived.join("")).toContain('"id":22');
		expect(secondReceived.join("")).not.toContain('"id":11');
	});

	it("#given malformed input #when a valid request follows #then the connection remains usable", async () => {
		const input = new PassThrough();
		const output = new PassThrough();
		const received: string[] = [];
		output.on("data", (chunk) => received.push(String(chunk)));
		const server = runMcpStdioServer(input, output);

		input.write("{malformed json}\n");
		input.end(`${JSON.stringify(initializeRequest(33, "recovering-client"))}\n`);
		await server;

		const responses = received
			.join("")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { readonly id: number | null; readonly error?: { readonly code: number } });
		expect(responses).toHaveLength(2);
		expect(responses[0]).toMatchObject({ id: null, error: { code: -32700 } });
		expect(responses[1]).toMatchObject({ id: 33 });
	});
});

function initializeRequest(id: number, clientName: string): Record<string, unknown> {
	return {
		jsonrpc: "2.0",
		id,
		method: "initialize",
		params: {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: clientName, version: "0.0.0" },
		},
	};
}
