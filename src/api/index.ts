export { getActiveInstance, getProvider, setActiveInstance } from "./client";
export { getBlockedUntil } from "./errors";
export type { Provider } from "./provider";
export type {
  ChangeRequest,
  ChangeRequestDetail,
  ChangeRequestNote,
  DiffChange,
  DiffResult,
  PageInfo,
  PaginatedResult,
  Project,
  ProjectReadme,
  ProviderKind,
  RepositoryTreeEntry,
  User,
} from "./types";

import { getProvider } from "./client";

export const getCurrentUser = () => getProvider().getCurrentUser();

export const listProjects = (params: {
  search?: string;
  page?: number;
  perPage?: number;
  membership?: boolean;
}) => getProvider().listProjects(params);

export const getProject = (id: number) => getProvider().getProject(id);

export const listRepositoryTree = (
  projectId: number,
  params?: { path?: string; ref?: string },
) => getProvider().listRepositoryTree(projectId, params);

export const getProjectReadme = (
  projectId: number,
  params?: { ref?: string },
) => getProvider().getProjectReadme(projectId, params);

export const getRepositoryFileRaw = (
  projectId: number,
  filePath: string,
  params?: { ref?: string },
) => getProvider().getRepositoryFileRaw(projectId, filePath, params);

export const listChangeRequests = (
  projectId: number,
  params: {
    state?: "open" | "closed" | "merged";
    search?: string;
    page?: number;
    perPage?: number;
  },
) => getProvider().listChangeRequests(projectId, params);

export const getChangeRequest = (projectId: number, iid: number) =>
  getProvider().getChangeRequest(projectId, iid);

export const getChangeRequestDiff = (projectId: number, iid: number) =>
  getProvider().getChangeRequestDiff(projectId, iid);

export const listChangeRequestNotes = (
  projectId: number,
  iid: number,
  includeSystem?: boolean,
) => getProvider().listChangeRequestNotes(projectId, iid, includeSystem);

export const createChangeRequestNote = (
  projectId: number,
  iid: number,
  body: string,
) => getProvider().createChangeRequestNote(projectId, iid, body);
