export { getActiveInstance, getProvider, setActiveInstance } from "./client";
export { getBlockedUntil } from "./errors";
export type { Provider } from "./provider";
export type {
  ApprovalInfo,
  ChangeRequest,
  ChangeRequestCommit,
  ChangeRequestDetail,
  ChangeRequestMetadata,
  ChangeRequestNote,
  DiffChange,
  DiffPosition,
  DiffRefs,
  DiffResult,
  DraftComment,
  InlineComment,
  Label,
  Notification,
  PageInfo,
  PaginatedResult,
  PipelineStatus,
  Project,
  ProjectReadme,
  ProviderKind,
  RepositoryTreeEntry,
  ReviewEvent,
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

export const listInlineComments = (projectId: number, iid: number) =>
  getProvider().listInlineComments(projectId, iid);

export const submitReview = (
  projectId: number,
  iid: number,
  params: Parameters<import("./provider").Provider["submitReview"]>[2],
) => getProvider().submitReview(projectId, iid, params);

export const resolveInlineComment = (
  projectId: number,
  iid: number,
  threadId: string,
  resolved: boolean,
) => getProvider().resolveInlineComment(projectId, iid, threadId, resolved);

export const replyToComment = (
  projectId: number,
  iid: number,
  commentId: number,
  body: string,
) => getProvider().replyToComment(projectId, iid, commentId, body);

export const editComment = (
  projectId: number,
  iid: number,
  commentId: number,
  body: string,
) => getProvider().editComment(projectId, iid, commentId, body);

export const deleteComment = (
  projectId: number,
  iid: number,
  commentId: number,
) => getProvider().deleteComment(projectId, iid, commentId);

export const listChangeRequestCommits = (projectId: number, iid: number) =>
  getProvider().listChangeRequestCommits(projectId, iid);

export const approveChangeRequest = (projectId: number, iid: number) =>
  getProvider().approveChangeRequest(projectId, iid);

export const unapproveChangeRequest = (projectId: number, iid: number) =>
  getProvider().unapproveChangeRequest(projectId, iid);

export const getNotifications = (options?: { since?: string }) =>
  getProvider().getNotifications(options);
