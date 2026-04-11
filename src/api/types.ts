export type ProviderKind = "gitlab" | "github";

export type User = {
  id: number;
  username: string;
  name: string;
  avatarUrl: string | null;
  webUrl: string;
};

export type Project = {
  id: number;
  name: string;
  path: string;
  fullPath: string;
  fullName: string;
  description: string | null;
  visibility: string;
  defaultBranch: string | null;
  webUrl: string;
  lastActivityAt: string;
  openIssuesCount: number;
  starCount: number;
};

export type ChangeRequest = {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: "open" | "closed" | "merged";
  sourceBranch: string;
  targetBranch: string;
  authorName: string | null;
  webUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type DiffRefs = {
  baseSha: string;
  headSha: string;
  startSha: string;
};

export type Label = {
  name: string;
  color: string | null;
};

export type PipelineStatus = {
  state: "pending" | "running" | "success" | "failed" | "canceled" | "unknown";
  url: string | null;
  details?: { name: string; state: string }[];
};

export type ApprovalInfo = {
  approved: boolean;
  approvalsGiven: number;
  approvalsRequired: number | null;
  approvedBy: string[];
  currentUserApproved: boolean;
};

export type ChangeRequestMetadata = {
  draft: boolean;
  labels: Label[];
  milestone: string | null;
  assignees: string[];
  reviewers: string[];
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  mergeable: boolean | null;
  mergeableState: string | null;
};

export type ChangeRequestDetail = ChangeRequest & {
  diffRefs?: DiffRefs;
  metadata?: ChangeRequestMetadata;
  pipeline?: PipelineStatus;
  approvals?: ApprovalInfo;
};

export type ChangeRequestCommit = {
  sha: string;
  shortSha: string;
  title: string;
  message: string;
  authorName: string | null;
  createdAt: string;
};

export type ChangeRequestNote = {
  id: number;
  body: string;
  authorName: string | null;
  createdAt: string;
  system: boolean;
  isOwn: boolean;
};

export type PageInfo = {
  current: number;
  previous: number | null;
  next: number | null;
  totalPages: number;
  perPage: number;
};

export type PaginatedResult<T> = {
  items: T[];
  pageInfo: PageInfo;
};

export type DiffChange = {
  oldPath: string;
  newPath: string;
  diffText: string;
  renamed: boolean;
  deleted: boolean;
  newFile: boolean;
};

export type DiffResult = {
  changes: DiffChange[];
};

export type RepositoryTreeEntry = {
  id: string;
  name: string;
  path: string;
  type: "tree" | "blob";
  mode: string;
};

export type ProjectReadme = {
  path: string;
  content: string;
};

export type DiffPosition = {
  path: string;
  oldPath: string;
  newLine?: number;
  oldLine?: number;
  startNewLine?: number;
  startOldLine?: number;
};

export type InlineComment = {
  id: number;
  body: string;
  authorName: string | null;
  createdAt: string;
  resolved: boolean;
  isOwn: boolean;
  threadId?: string;
  position: DiffPosition;
  replies: InlineComment[];
};

export type DraftComment = {
  localId: string;
  body: string;
  position: DiffPosition;
};

export type ReviewEvent = "approve" | "request_changes" | "comment";

export type Notification = {
  id: string;
  reason: string;
  subject: string;
  updatedAt: string;
  repository: string;
  url: string | null;
};
