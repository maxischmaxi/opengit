import type {
  ChangeRequest,
  ChangeRequestDetail,
  ChangeRequestNote,
  DiffResult,
  PaginatedResult,
  Project,
  ProjectReadme,
  ProviderKind,
  RepositoryTreeEntry,
  User,
} from "./types";

export interface Provider {
  readonly kind: ProviderKind;

  getCurrentUser(): Promise<User>;

  listProjects(params: {
    search?: string;
    page?: number;
    perPage?: number;
    membership?: boolean;
  }): Promise<PaginatedResult<Project>>;

  getProject(id: number): Promise<Project>;

  listRepositoryTree(
    projectId: number,
    params?: { path?: string; ref?: string },
  ): Promise<RepositoryTreeEntry[]>;

  getProjectReadme(
    projectId: number,
    params?: { ref?: string },
  ): Promise<ProjectReadme | null>;

  getRepositoryFileRaw(
    projectId: number,
    filePath: string,
    params?: { ref?: string },
  ): Promise<string>;

  listChangeRequests(
    projectId: number,
    params: {
      state?: "open" | "closed" | "merged";
      search?: string;
      page?: number;
      perPage?: number;
    },
  ): Promise<PaginatedResult<ChangeRequest>>;

  getChangeRequest(
    projectId: number,
    iid: number,
  ): Promise<ChangeRequestDetail>;

  getChangeRequestDiff(
    projectId: number,
    iid: number,
  ): Promise<DiffResult>;

  listChangeRequestNotes(
    projectId: number,
    iid: number,
    includeSystem?: boolean,
  ): Promise<ChangeRequestNote[]>;

  createChangeRequestNote(
    projectId: number,
    iid: number,
    body: string,
  ): Promise<ChangeRequestNote>;

  validateToken(): Promise<User>;
}
