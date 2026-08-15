import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TabContainer } from './TabContainer';

const mockStore = {
    tabs: [
        { id: 'project-1', name: 'Project 1', path: 'C:/project-1.pmp' },
        { id: 'project-2', name: 'Project 2', path: 'C:/project-2.pmp' },
    ],
    activeTabId: 'project-1',
    setActiveTab: vi.fn(),
    removeTab: vi.fn(),
};

vi.mock('./useTabStore', () => ({
    useTabStore: Object.assign(vi.fn(() => mockStore), {
        getState: () => mockStore,
    }),
}));

describe('TabContainer navigation guards', () => {
    beforeEach(() => {
        mockStore.setActiveTab.mockReset();
        mockStore.removeTab.mockReset();
    });

    it('does not switch tabs when the guard cancels', async () => {
        const user = userEvent.setup();
        const onTabSwitch = vi.fn().mockResolvedValue(false);
        render(<TabContainer onTabSwitch={onTabSwitch} />);

        await user.click(screen.getByText('Project 2'));

        expect(onTabSwitch).toHaveBeenCalledWith('project-2');
        expect(mockStore.setActiveTab).not.toHaveBeenCalled();
    });

    it('does not remove a tab when the close guard cancels', async () => {
        const user = userEvent.setup();
        const onTabClose = vi.fn().mockResolvedValue(false);
        render(<TabContainer onTabClose={onTabClose} />);

        await user.click(screen.getByRole('button', { name: 'Close Project 1' }));

        expect(onTabClose).toHaveBeenCalledWith('project-1');
        expect(mockStore.removeTab).not.toHaveBeenCalled();
    });
});
