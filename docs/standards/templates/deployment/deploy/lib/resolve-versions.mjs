// cspell:ignore topo APPVERSION
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Deployment-strategy template — version resolver.
 *
 * Proven in the `forgeboard-deploy-sample` real-CI run and copied here
 * verbatim (see the demonstration record held by the consuming programme).
 * Pure logic: nothing here is app-specific, so the template carries it
 * unchanged. The app name flows in through `descriptor.appName`.
 */

/** Kahn topological sort with alphabetical tie-break. Throws on a cycle. */
export function topoOrder(components) {
  const names = Object.keys(components);
  const deps = new Map(
    names.map((n) => [n, [...(components[n].dependsOn ?? [])]]),
  );
  const result = [];
  const satisfied = (n) => deps.get(n).every((d) => result.includes(d));
  while (result.length < names.length) {
    const ready = names
      .filter((n) => !result.includes(n) && satisfied(n))
      .sort();
    if (ready.length === 0) {
      const remaining = names.filter((n) => !result.includes(n));
      throw new Error(
        `cycle: unresolved dependencies among ${remaining.join(", ")}`,
      );
    }
    result.push(...ready);
  }
  return result;
}

const RANK = { major: 3, minor: 2, patch: 1, none: 0 };

function bumpVersion(prev, kind) {
  const [maj, min, pat] = prev.split("-")[0].split(".").map(Number);
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  if (kind === "patch") return `${maj}.${min}.${pat + 1}`;
  return `${maj}.${min}.${pat}`;
}

/**
 * appVersion reflects the app's public surface. Only public components
 * contribute, and their bump propagates directly — a public MAJOR (a
 * Conventional Commits BREAKING CHANGE / `!`, api or ui alike) drives an app
 * MAJOR. Any change anywhere → at least a patch. When any component is a
 * prerelease, the app is a prerelease on the same channel.
 */
export function deriveAppVersion({
  components,
  results,
  resolved,
  prevAppVersion,
  prereleaseId = "beta",
  buildId = "0",
}) {
  let best = "none";
  // Any component change (public or not) floors the app at a patch bump; only
  // public components can raise it above patch.
  const anyChange = Object.values(results).some((r) => r.bump);
  for (const [name, comp] of Object.entries(components)) {
    if (!comp.public) continue;
    const contribution = results[name].bump ?? "none";
    if (RANK[contribution] > RANK[best]) best = contribution;
  }
  if (best === "none" && anyChange) best = "patch";
  let version = bumpVersion(prevAppVersion, best);
  const prerelease = Object.values(resolved).some((r) => r.prerelease);
  if (prerelease) version = `${version}-${prereleaseId}.${buildId}`;
  return version;
}

/** Merge descriptor + per-component version results into the published manifest. */
export function resolve({
  descriptor,
  results,
  prevAppVersion = "0.0.0",
  prereleaseId = "beta",
  buildId = "0",
  gitSha = "",
  builtAt = new Date().toISOString(),
}) {
  const components = descriptor.components;
  // No taint: a component is prerelease iff its own paths changed on the branch
  // (results[n].prerelease); untouched components stay stable at their last release.
  const resolved = Object.fromEntries(
    Object.keys(components).map((n) => [
      n,
      { version: results[n].version, prerelease: results[n].prerelease },
    ]),
  );
  const appVersion = deriveAppVersion({
    components,
    results,
    resolved,
    prevAppVersion,
    prereleaseId,
    buildId,
  });
  const outComponents = {};
  for (const [name, comp] of Object.entries(components)) {
    outComponents[name] = {
      ...comp,
      version: results[name].version,
      changed: results[name].changed ?? false,
      package: `${descriptor.appName}-${name}@${results[name].version}.zip`,
    };
  }
  process.stderr.write(`APPVERSION: ${prevAppVersion} -> ${appVersion}\n`);
  return {
    appName: descriptor.appName,
    appVersion,
    deployToolVersion: results.deploy?.version ?? "0.0.0",
    gitSha,
    builtAt,
    app: descriptor.app ?? {
      preDeploy: [],
      verify: ["verify/app-smoke.ps1"],
      postDeploy: [],
    },
    components: outComponents,
  };
}

// CLI — pathToFileURL normalises Windows backslashes + the file:/// form so the
// "run directly" check works cross-platform (CI runs on windows-latest).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [descPath, resultsPath, ...rest] = process.argv.slice(2);
  const opt = (flag, def) => {
    const i = rest.indexOf(flag);
    return i >= 0 ? rest[i + 1] : def;
  };
  const descriptor = JSON.parse(readFileSync(descPath, "utf8"));
  const results = JSON.parse(readFileSync(resultsPath, "utf8"));
  const manifest = resolve({
    descriptor,
    results,
    prevAppVersion: opt("--prev", "0.0.0"),
    prereleaseId: opt("--prerelease-id", "beta"),
    buildId: opt("--build-id", "0"),
    gitSha: opt("--sha", ""),
  });
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
}
