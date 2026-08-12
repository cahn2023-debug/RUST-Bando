import { describe, expect, it } from "vitest";
import type { Project } from "@CONTRACT/types";
import { backfillProjectPath } from "./projectPathUtils";

const mkProject = (overrides: Partial<Project>): Project =>
  ({
    id: "p1",
    name: "Project One",
    path: "",
    description: null,
    contract_number: null,
    investor: null,
    contractor: null,
    signed_date: null,
    duration: null,
    end_date: null,
    status: "active",
    created_at: "",
    updated_at: "",
    ...overrides,
  } as Project);

describe("backfillProjectPath", () => {
  it("keeps path when project already has one", () => {
    const input = mkProject({ path: "D:/a.pmp" });
    const out = backfillProjectPath(input, [mkProject({ id: "p1", path: "D:/b.pmp" })]);
    expect(out?.path).toBe("D:/a.pmp");
  });

  it("fills path by id first", () => {
    const input = mkProject({ id: "p2", name: "A", path: "" });
    const out = backfillProjectPath(input, [
      mkProject({ id: "p2", name: "B", path: "D:/from-id.pmp" }),
      mkProject({ id: "x", name: "A", path: "D:/from-name.pmp" }),
    ]);
    expect(out?.path).toBe("D:/from-id.pmp");
  });

  it("fills path by name when id not found", () => {
    const input = mkProject({ id: "missing", name: "Proj", path: "" });
    const out = backfillProjectPath(input, [mkProject({ id: "p3", name: "Proj", path: "D:/from-name.pmp" })]);
    expect(out?.path).toBe("D:/from-name.pmp");
  });

  it("returns original when no candidate can backfill", () => {
    const input = mkProject({ id: "missing", name: "Proj", path: "" });
    const out = backfillProjectPath(input, [mkProject({ id: "p3", name: "Other", path: "D:/x.pmp" })]);
    expect(out?.path).toBe("");
  });
});

