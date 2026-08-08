import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiAssistantPanel } from "./AiAssistantPanel";
import { safeInvoke } from "@IMPLEMENT/lib/tauri";

const mocks = vi.hoisted(() => ({
    setEnableAi: vi.fn(),
}));

vi.mock("@IMPLEMENT/lib/tauri", () => ({
    IS_REAL_TAURI: true,
    safeInvoke: vi.fn(),
    safeListen: vi.fn(async () => vi.fn()),
}));

vi.mock("@IMPLEMENT/stores/useDesignSync", () => {
    const store = {
        projectId: "11111111-1111-4111-8111-111111111111",
        projectPath: "D:/demo/project.pmp",
        state: {
            regions: {},
            layers: {},
            feature_groups: {},
            features: { f1: { id: "f1" } },
            settings: {},
        },
    };
    const useDesignSync = (selector?: (state: typeof store) => unknown) => {
        if (typeof selector === "function") return selector(store);
        return store;
    };
    useDesignSync.getState = () => store;
    return { useDesignSync };
});

vi.mock("@CORE/stores/useSettingsStore", () => ({
    useSettingsStore: () => ({
        enableAi: true,
        setEnableAi: mocks.setEnableAi,
    }),
}));

const aiConfig = {
    enable_ai: true,
    low_power_mode: false,
    provider_enabled: false,
    provider_base_url: "https://api.openai.com/v1",
    provider_model: "gpt-4o-mini",
    max_tokens: 1200,
    timeout_ms: 45000,
    cloud_confirm_each_request: true,
    has_api_key: false,
};

const aiStatus = {
    state: "LOCAL_READY",
    enabled: true,
    localReady: true,
    cloudReady: false,
    downloading: false,
    loadedSessions: [],
    models: [
        {
            id: "minilm-embedding",
            role: "embedding",
            version: "all-MiniLM-L6-v2",
            installed: true,
            sizeBytes: 1024,
        },
    ],
};

describe("AiAssistantPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(safeInvoke).mockImplementation(async (command: string) => {
            switch (command) {
                case "get_ai_status":
                    return aiStatus as never;
                case "get_ai_config":
                    return aiConfig as never;
                case "list_ai_conversations":
                    return [{ id: "conv-1" }] as never;
                case "list_ai_messages":
                    return [] as never;
                default:
                    return null as never;
            }
        });
    });

    it("saves AI config and API key from the Config tab", async () => {
        render(<AiAssistantPanel />);

        await screen.findByText("LOCAL READY");
        fireEvent.click(await screen.findByRole("button", { name: /config/i }));
        fireEvent.change(screen.getByPlaceholderText(/OpenAI-compatible API key/i), {
            target: { value: "sk-test" },
        });
        fireEvent.click(screen.getByRole("button", { name: /Save AI API key/i }));
        await waitFor(() => {
            expect(safeInvoke).toHaveBeenCalledWith("set_ai_api_key", { apiKey: "sk-test" });
        });
        fireEvent.click(screen.getByRole("button", { name: /save ai config/i }));

        await waitFor(() => {
            expect(safeInvoke).toHaveBeenCalledWith("update_ai_config", expect.objectContaining({
                config: expect.objectContaining({ enableAi: true }),
            }));
        });
    });

    it("renders chat action proposals and sends accept/reject commands", async () => {
        vi.mocked(safeInvoke).mockImplementation(async (command: string) => {
            if (command === "get_ai_status") return aiStatus as never;
            if (command === "get_ai_config") return aiConfig as never;
            if (command === "list_ai_conversations") return [{ id: "conv-1" }] as never;
            if (command === "send_ai_message") {
                return {
                    requestId: "req-1",
                    content: "Tôi đề xuất cập nhật metadata.",
                    provider: "local",
                    model: "local-rag-summary-v1",
                    citations: [{ title: "demo.pdf", snippet: "contract", score: 0.9 }],
                    actionProposals: [{
                        id: "act-1",
                        actionType: "update_contract_metadata",
                        targetTable: "files",
                        diff: { status: "approved" },
                    }],
                };
            }
            return null;
        });

        render(<AiAssistantPanel />);

        const input = await screen.findByPlaceholderText(/Type a query or command/i);
        fireEvent.change(input, { target: { value: "cap nhat hop dong" } });
        fireEvent.click(screen.getByRole("button", { name: /Send AI message/i }));

        expect(await screen.findByText(/Proposed Action Diff/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Accept/i }));

        await waitFor(() => {
            expect(safeInvoke).toHaveBeenCalledWith("confirm_ai_action", { actionId: "act-1" });
        });
    });
});
