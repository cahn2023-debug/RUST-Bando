import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeInvoke } from '@IMPLEMENT/lib/tauri';
import AnalyticsDashboard from './AnalyticsDashboard';

vi.mock('@IMPLEMENT/lib/tauri', () => ({
  safeInvoke: vi.fn(),
}));

const mockInvoke = vi.mocked(safeInvoke);

describe('AnalyticsDashboard', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('loads and renders project analytics data', async () => {
    mockInvoke.mockImplementation(async (command: string, args?: unknown) => {
      if (command === 'get_dashboard_project_stats') {
        expect(args).toEqual({ projectId: 'project-123' });
        return { total_files: 12, total_size: 4096 };
      }
      if (command === 'get_dashboard_extension_dist') {
        expect(args).toEqual({ projectId: 'project-123' });
        return [
          { extension: 'ts', count: 8 },
          { extension: 'md', count: 4 },
        ];
      }
      if (command === 'get_dashboard_top_files') {
        expect(args).toEqual({ projectId: 'project-123', limit: 10 });
        return [
          { name: 'main.ts', size: 2048 },
          { name: 'README.md', size: 1024 },
        ];
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    render(<AnalyticsDashboard projectId="project-123" />);

    expect(screen.getByText('Aggregating project data...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Project Analytics')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Total Files').length).toBeGreaterThan(0);
    expect(screen.getAllByText('4 KB').length).toBeGreaterThan(0);
    expect(screen.getByText('main.ts')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('ts')).toBeInTheDocument();
    expect(screen.getByText('md')).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledTimes(3);
  });

  it('shows an error state and retries successfully', async () => {
    let attempt = 0;
    mockInvoke.mockImplementation(async (command: string) => {
      if (attempt === 0) {
        attempt += 1;
        throw new Error('backend unavailable');
      }

      if (command === 'get_dashboard_project_stats') {
        return { total_files: 1, total_size: 1024 };
      }
      if (command === 'get_dashboard_extension_dist') {
        return [{ extension: 'rs', count: 1 }];
      }
      if (command === 'get_dashboard_top_files') {
        return [{ name: 'lib.rs', size: 1024 }];
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    render(<AnalyticsDashboard projectId="project-456" />);

    await waitFor(() => {
      expect(screen.getByText('Analytics Error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    await waitFor(() => {
      expect(screen.getByText('Project Analytics')).toBeInTheDocument();
    });

    expect(screen.getAllByText('1 KB').length).toBeGreaterThan(0);
    expect(screen.getByText('lib.rs')).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledTimes(6);
  });
});
