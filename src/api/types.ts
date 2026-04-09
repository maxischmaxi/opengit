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

export type ChangeRequestDetail = ChangeRequest;

export type ChangeRequestNote = {
  id: number;
  body: string;
  authorName: string | null;
  createdAt: string;
  system: boolean;
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
