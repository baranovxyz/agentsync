import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const workflow = readFileSync(
  join(repo, ".github", "workflows", "publish.yml"),
  "utf8",
);
const prepare = workflow.split("\n  prepare:\n")[1]?.split("\n  publish:\n")[0];
const publish = workflow.split("\n  publish:\n")[1]?.split("\n  verify:\n")[0];
const verify = workflow
  .split("\n  verify:\n")[1]
  ?.split("\n  tag-and-release:\n")[0];
const release = workflow.split("\n  tag-and-release:\n")[1];

assert.ok(prepare && publish && verify && release, "release workflow jobs are complete");
assert.match(
  prepare,
  /github\.repository == 'baranovxyz\/agentsync'.*github\.ref == 'refs\/heads\/main'/s,
);
assert.doesNotMatch(prepare, /id-token: write/);
assert.match(prepare, /pnpm install --frozen-lockfile/);
assert.match(prepare, /pnpm test:artifact/);
assert.match(prepare, /npm pack --ignore-scripts/);
assert.match(prepare, /Verify packed dist against reviewed manifest/);
assert.match(prepare, /scripts\/verify-dist-manifest\.mjs/);
assert.match(prepare, /path: agentsync-release\.tgz/);
assert.ok(
  workflow.indexOf("- name: Pack release candidate") <
    workflow.indexOf("- name: Verify packed dist against reviewed manifest"),
  "the final pack must precede manifest verification",
);
assert.ok(
  workflow.indexOf("- name: Verify packed dist against reviewed manifest") <
    workflow.indexOf("- name: Upload tested release candidate"),
  "manifest verification must precede artifact upload",
);

assert.match(publish, /environment: npm/);
assert.match(publish, /actions: read/);
assert.match(publish, /id-token: write/);
assert.doesNotMatch(publish, /contents: (read|write)/);
assert.doesNotMatch(publish, /actions\/checkout@/);
assert.doesNotMatch(publish, /pnpm |test:artifact|npm view|from "zod"/);
assert.doesNotMatch(publish, /NPM_TOKEN|NODE_AUTH_TOKEN|npm@latest/);
assert.match(publish, /npm install -g npm@11\.17\.0 --ignore-scripts/);
assert.match(publish, /release-artifact\/agentsync-release\.tgz/);
assert.match(publish, /downloaded release candidate integrity mismatch/);
assert.match(
  publish,
  /npm publish "\$ARTIFACT" --provenance --access public --ignore-scripts --tag/,
);

assert.doesNotMatch(verify, /id-token: write|environment: npm/);
assert.match(verify, /zod@4\.4\.3/);
assert.match(verify, /dist\.attestations\.url/);
assert.match(verify, /https:\/\/slsa\.dev\/provenance\/v1/);
assert.match(verify, /process\.env\.EXPECTED_SHA/);
assert.match(verify, /https:\/\/github\.com\/baranovxyz\/agentsync/);
assert.match(release, /needs\.verify\.result == 'success'/);
assert.match(workflow, /finalize-only/);
assert.match(workflow, /already published; dry-run requires an unpublished version/);
assert.match(workflow, /grep -q 'E404'/);
assert.doesNotMatch(workflow, /NPM_TOKEN|npm@latest|Bump version|npm version /);
assert.equal(workflow.match(/id-token: write/g)?.length, 1);

const actionRefs = [...workflow.matchAll(/uses: [^@\s]+@([^\s#]+)/g)].map(
  (match) => match[1],
);
assert.ok(actionRefs.length > 0, "publish workflow must use actions");
assert.ok(
  actionRefs.every((ref) => /^[0-9a-f]{40}$/.test(ref ?? "")),
  "every publish action must be pinned to a full commit",
);

console.log("Publish workflow isolation contract passed.");
