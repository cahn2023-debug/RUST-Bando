import type { Project } from "@CONTRACT/types";

export const backfillProjectPath = (project: Project | null, candidates: Project[]): Project | null => {
  if (!project) return null;
  if (project.path) return project;

  const byId = candidates.find((item) => item.id === project.id && !!item.path);
  if (byId) return { ...project, path: byId.path };

  const byName = candidates.find((item) => item.name === project.name && !!item.path);
  if (byName) return { ...project, path: byName.path };

  return project;
};

