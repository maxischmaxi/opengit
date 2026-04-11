import type {
  ChangeRequest,
  ChangeRequestCommit,
  ChangeRequestDetail,
  ChangeRequestNote,
  DiffRefs,
  DiffResult,
  DraftComment,
  InlineComment,
  Notification,
  PaginatedResult,
  Project,
  ProjectReadme,
  ProviderKind,
  RepositoryTreeEntry,
  ReviewEvent,
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

  listInlineComments(
    projectId: number,
    iid: number,
  ): Promise<InlineComment[]>;

  submitReview(
    projectId: number,
    iid: number,
    params: {
      event: ReviewEvent;
      body?: string;
      comments: DraftComment[];
      diffRefs?: DiffRefs;
    },
  ): Promise<void>;

  resolveInlineComment(
    projectId: number,
    iid: number,
    threadId: string,
    resolved: boolean,
  ): Promise<void>;

  replyToComment(
    projectId: number,
    iid: number,
    commentId: number,
    body: string,
  ): Promise<void>;

  editComment(
    projectId: number,
    iid: number,
    commentId: number,
    body: string,
  ): Promise<void>;

  deleteComment(
    projectId: number,
    iid: number,
    commentId: number,
  ): Promise<void>;

  listChangeRequestCommits(
    projectId: number,
    iid: number,
  ): Promise<ChangeRequestCommit[]>;

  approveChangeRequest(
    projectId: number,
    iid: number,
  ): Promise<void>;

  unapproveChangeRequest(
    projectId: number,
    iid: number,
  ): Promise<void>;

  getNotifications(
    options?: { since?: string },
  ): Promise<{ notifications: Notification[]; pollInterval: number }>;

  validateToken(): Promise<User>;
}
