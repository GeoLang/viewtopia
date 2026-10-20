import { beforeEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { NotebookPanel } from '../../src/notebooks/NotebookPanel';
import { useNotebookStore } from '../../src/notebooks/notebookStore';
import { useProjectsStore } from '../../src/projects/projectsStore';

window.matchMedia = (() => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})) as unknown as typeof window.matchMedia;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function activate(projectId: string | null): void {
  act(() => useProjectsStore.setState({ activeProjectId: projectId }));
}

async function createNotebook(name: string): Promise<void> {
  fireEvent.change(screen.getByPlaceholderText('New notebook name...'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Back to notebooks' }));
}

function renderPanel() {
  return render(
    <MantineProvider>
      <NotebookPanel onClose={() => {}} />
    </MantineProvider>,
  );
}

beforeEach(() => {
  useNotebookStore.setState({ notebooks: [], activeNotebookId: null, loading: false });
  useProjectsStore.setState({ items: [], activeProjectId: null, loading: false });
});

describe('notebooks belong to the active project', () => {
  it('files a new notebook under the active project and lists only that project', async () => {
    activate('project-venice');
    renderPanel();

    await createNotebook('Canals');

    expect(useNotebookStore.getState().notebooks.map((notebook) => notebook.projectId)).toEqual(['project-venice']);
    expect(screen.getByText('Canals')).toBeInTheDocument();

    activate('project-lyon');
    expect(screen.queryByText('Canals')).not.toBeInTheDocument();
    expect(screen.getByText(/No notebooks yet/)).toBeInTheDocument();

    activate(null);
    expect(screen.queryByText('Canals')).not.toBeInTheDocument();
  });

  it('lists a notebook made with no project active in every project', async () => {
    renderPanel();

    await createNotebook('Scratch');

    expect(useNotebookStore.getState().notebooks[0].projectId).toBeUndefined();
    activate('project-lyon');
    expect(screen.getByText('Scratch')).toBeInTheDocument();
  });

  it('closes an open notebook when the project it belongs to stops being active', async () => {
    activate('project-venice');
    renderPanel();
    await createNotebook('Canals');
    fireEvent.click(screen.getByText('Canals'));
    expect(screen.getByRole('button', { name: 'Run all cells' })).toBeInTheDocument();

    activate('project-lyon');

    expect(screen.queryByRole('button', { name: 'Run all cells' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('New notebook name...')).toBeInTheDocument();
  });
});
