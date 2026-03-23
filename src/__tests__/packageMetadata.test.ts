import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../..");

type PackageJson = {
  name: string;
  publishConfig?: {
    access?: string;
  };
  files?: string[];
  repository?: {
    url?: string;
  };
  bugs?: {
    url?: string;
  };
  homepage?: string;
  author?: string;
};

const packageJson = JSON.parse(
  readFileSync(resolve(repoRoot, "package.json"), "utf8")
) as PackageJson;
const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");

describe("publish metadata", () => {
  it("uses the scoped npm package metadata", () => {
    expect(packageJson.name).toBe("@akrym1582/azstorage-mcp-server");
    expect(packageJson.publishConfig).toEqual({ access: "public" });
    expect(packageJson.files).toContain(".env.example");
  });

  it("points repository metadata at the current GitHub repository", () => {
    expect(packageJson.repository?.url).toBe("git+https://github.com/akrym1582/azstorage-mcp-server.git");
    expect(packageJson.bugs?.url).toBe("https://github.com/akrym1582/azstorage-mcp-server/issues");
    expect(packageJson.homepage).toBe("https://github.com/akrym1582/azstorage-mcp-server#readme");
    expect(packageJson.author).toBe("akrym1582");
  });

  it("documents the scoped package install commands", () => {
    expect(readme).toContain("npm install -g @akrym1582/azstorage-mcp-server");
    expect(readme).toContain("npx @akrym1582/azstorage-mcp-server");
    expect(readme).toContain("\"args\": [\"-y\", \"@akrym1582/azstorage-mcp-server\"]");
  });
});
