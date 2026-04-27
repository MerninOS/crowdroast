import { describe, expect, it } from "vitest";
import {
  diffMigrations,
  parseRemoteApplied,
} from "../check-migrations-applied";

describe("parseRemoteApplied", () => {
  it("returns [] for empty input", () => {
    expect(parseRemoteApplied("")).toEqual([]);
  });

  it("ignores header / separator / blank lines", () => {
    const stdout = `
Connecting to remote database...

   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
`;
    expect(parseRemoteApplied(stdout)).toEqual([]);
  });

  it("extracts the Remote column from a fully-synced ledger", () => {
    const stdout = `
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20240101000001 | 20240101000001 | 2024-01-01 00:00:01
   20240101000002 | 20240101000002 | 2024-01-01 00:00:02
   20240101000003 | 20240101000003 | 2024-01-01 00:00:03
`;
    expect(parseRemoteApplied(stdout)).toEqual([
      "20240101000001",
      "20240101000002",
      "20240101000003",
    ]);
  });

  it("ignores rows where the Remote column is blank (local-only migrations)", () => {
    const stdout = `
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20240101000001 | 20240101000001 | 2024-01-01 00:00:01
   20240101000002 |                |
   20240101000003 |                |
`;
    expect(parseRemoteApplied(stdout)).toEqual(["20240101000001"]);
  });

  it("includes rows where Local is blank but Remote is set (remote-only migrations)", () => {
    const stdout = `
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
                  | 20260101000099 | 2026-01-01 00:00:00
`;
    expect(parseRemoteApplied(stdout)).toEqual(["20260101000099"]);
  });
});

describe("diffMigrations", () => {
  it("returns no unapplied when local and remote are identical", () => {
    expect(
      diffMigrations(
        ["20240101000001", "20240101000002"],
        ["20240101000001", "20240101000002"],
      ),
    ).toEqual({ unapplied: [] });
  });

  it("returns local files that are missing on remote", () => {
    expect(
      diffMigrations(
        ["20240101000001", "20240101000002", "20240101000003"],
        ["20240101000001"],
      ),
    ).toEqual({ unapplied: ["20240101000002", "20240101000003"] });
  });

  it("does NOT flag remote-only migrations as an error", () => {
    // Prod has a migration that doesn't exist in the local branch — that
    // means prod is ahead of this branch, which is fine for the dev → prod
    // guard. Only local-not-on-prod is a merge blocker.
    expect(
      diffMigrations(["20240101000001"], [
        "20240101000001",
        "20260101000099",
      ]),
    ).toEqual({ unapplied: [] });
  });

  it("handles mixed gaps in both directions", () => {
    expect(
      diffMigrations(
        ["20240101000001", "20240101000002", "20240101000003", "20240101000004"],
        ["20240101000001", "20240101000003", "20260101000099"],
      ),
    ).toEqual({ unapplied: ["20240101000002", "20240101000004"] });
  });

  it("handles empty inputs", () => {
    expect(diffMigrations([], [])).toEqual({ unapplied: [] });
    expect(diffMigrations(["20240101000001"], [])).toEqual({
      unapplied: ["20240101000001"],
    });
    expect(diffMigrations([], ["20240101000001"])).toEqual({ unapplied: [] });
  });
});
