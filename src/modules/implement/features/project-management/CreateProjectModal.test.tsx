import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateProjectModal } from "./CreateProjectModal";

const mockInvoke = vi.fn();
const mockSaveDialog = vi.fn();

vi.mock("@IMPLEMENT/lib/tauri", () => ({
  safeInvoke: (...args: unknown[]) => mockInvoke(...args),
  safeSaveDialog: (...args: unknown[]) => mockSaveDialog(...args),
}));

describe("CreateProjectModal", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockSaveDialog.mockReset();
  });

  it("calls create_pmp_v2 with the new path/name/description contract", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const createdProject = {
      id: "project-1",
      name: "New Project",
      path: "C:/workspace/New Project.pmp",
      description: "Demo description",
      contract_number: null,
      investor: null,
      contractor: null,
      signed_date: null,
      duration: null,
      end_date: null,
      status: "active",
      created_at: "2026-07-10T00:00:00Z",
      updated_at: "2026-07-10T00:00:00Z",
    };

    mockSaveDialog.mockResolvedValue(createdProject.path);
    mockInvoke.mockResolvedValue(createdProject);

    render(<CreateProjectModal onClose={onClose} onSuccess={onSuccess} />);

    await user.click(screen.getByTitle("Browse..."));
    await waitFor(() => {
      expect(screen.getByText(/Project Name:/)).toHaveTextContent("New Project");
    });

    await user.type(screen.getByPlaceholderText("Short description..."), "Demo description");
    await user.click(screen.getByRole("button", { name: "Create Project" }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("create_pmp_v2", {
        path: createdProject.path,
        name: "New Project",
        description: "Demo description",
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(createdProject);
    expect(onClose).toHaveBeenCalled();
  });
});
