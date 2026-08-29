import { useProjectsStore } from '../projects/projectsStore';
import type { Project } from '../projects/types';
import { ActionError, registerAction } from './registry';
import { labelOf, resolveOne } from './resolve';

/** The projects this account can open, asking the server on the first call. */
async function knownProjects(): Promise<Project[]> {
  if (useProjectsStore.getState().items.length === 0) {
    await useProjectsStore.getState().load();
  }
  return useProjectsStore.getState().items;
}

registerAction({
  name: 'project.list',
  description: 'List the projects this account can open.',
  parameters: {},
  reads: true,
  run: async () => {
    const projects = await knownProjects();
    if (projects.length === 0) return { text: 'This account has no projects.' };
    const lines = projects.map((project) => labelOf(project, projects)).join(', ');
    return { text: `${projects.length} projects: ${lines}.` };
  },
});

registerAction({
  name: 'project.open',
  description: 'Open a project, putting its saved map on screen.',
  parameters: {
    project: { type: 'string', description: 'Project id or name.', required: true },
  },
  run: async (args) => {
    const project = resolveOne('project', args.project as string, await knownProjects());
    if (useProjectsStore.getState().activeProjectId === project.id) {
      throw new ActionError(`${project.name} is already open.`);
    }
    await useProjectsStore.getState().switchTo(project.id);
    return { text: `Opened ${project.name}.` };
  },
});
