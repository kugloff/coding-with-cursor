import assert from "node:assert/strict";
import {
  normalizeWorkspaceEnvironment,
  normalizeWorkspaceEnvironmentFromBody,
  normalizeWorkspaceEnvironmentOrNull,
  workspaceEnvironmentIdsLabel,
} from "../../shared/workspaceEnvironments.js";

assert.equal(normalizeWorkspaceEnvironment("csharp"), "csharp");
assert.equal(normalizeWorkspaceEnvironment("C#"), "csharp");
assert.equal(normalizeWorkspaceEnvironment("javascript"), "js");
assert.equal(normalizeWorkspaceEnvironment("unknown"), "js");
assert.equal(normalizeWorkspaceEnvironmentOrNull("csharp"), "csharp");
assert.equal(normalizeWorkspaceEnvironmentOrNull("bogus"), null);
assert.equal(
  normalizeWorkspaceEnvironmentFromBody({ environment: "c#", runtime: "js" }),
  "csharp",
);
assert.equal(normalizeWorkspaceEnvironmentFromBody({ runtime: "python" }), "python");
assert.equal(normalizeWorkspaceEnvironmentFromBody({}), "js");
assert.match(workspaceEnvironmentIdsLabel(), /js.*python.*csharp/);

console.log("test-workspace-env: ok");
