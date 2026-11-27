import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (!Object.hasOwn(request, "id")) continue;
  appendFileSync(process.env.AGENCY_TEST_MCP_LOG, `${request.method}\n`);
  let result;
  if (request.method === "initialize") {
    result = { protocolVersion: request.params.protocolVersion,
      capabilities: { tools: {} }, serverInfo: { name: "agency-wrapper-fixture", version: "1" } };
  } else if (request.method === "tools/list") {
    result = { tools: [{ name: "ping", description: "Return the integration test marker.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false } }] };
  } else if (request.method === "tools/call" && request.params.name === "ping") {
    result = { content: [{ type: "text", text: "agency-wrapper-mcp-ok" }] };
  } else if (request.method === "ping") {
    result = {};
  } else {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id,
      error: { code: -32601, message: "Method not found" } })}\n`);
    continue;
  }
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n`);
}
