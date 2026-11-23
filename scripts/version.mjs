// Prints the version to bake into a deploy: `git describe --always`, made unambiguous for an uncommitted tree.
// A dirty tree gets a timestamp, so two deploys from the same commit never share a version and the page can tell
// that it is out of date. Outside a git checkout it prints "dev".
import { execFileSync } from "node:child_process";

try {
  const v = execFileSync("git", ["describe", "--always", "--dirty"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  console.log(v.endsWith("-dirty") ? `${v}.${Math.floor(Date.now() / 1000).toString(36)}` : v);
} catch {
  console.log("dev");
}
