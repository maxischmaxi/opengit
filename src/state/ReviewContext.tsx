import { createContext, useCallback, useContext, useReducer } from "react";

import { submitReview as submitReviewApi } from "../api";
import type {
  DiffPosition,
  DiffRefs,
  DraftComment,
  ReviewEvent,
} from "../api/types";

type ReviewState = {
  active: boolean;
  drafts: DraftComment[];
  submitting: boolean;
  error: string | null;
};

type ReviewAction =
  | { type: "START_REVIEW" }
  | { type: "ADD_DRAFT"; draft: DraftComment }
  | { type: "REMOVE_DRAFT"; localId: string }
  | { type: "EDIT_DRAFT"; localId: string; body: string }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS" }
  | { type: "SUBMIT_ERROR"; error: string }
  | { type: "DISCARD_REVIEW" };

const initialState: ReviewState = {
  active: false,
  drafts: [],
  submitting: false,
  error: null,
};

const reducer = (state: ReviewState, action: ReviewAction): ReviewState => {
  switch (action.type) {
    case "START_REVIEW":
      return { ...state, active: true, error: null };
    case "ADD_DRAFT":
      return {
        ...state,
        active: true,
        drafts: [...state.drafts, action.draft],
        error: null,
      };
    case "REMOVE_DRAFT":
      return {
        ...state,
        drafts: state.drafts.filter((d) => d.localId !== action.localId),
      };
    case "EDIT_DRAFT":
      return {
        ...state,
        drafts: state.drafts.map((d) =>
          d.localId === action.localId ? { ...d, body: action.body } : d,
        ),
      };
    case "SUBMIT_START":
      return { ...state, submitting: true, error: null };
    case "SUBMIT_SUCCESS":
      return initialState;
    case "SUBMIT_ERROR":
      return { ...state, submitting: false, error: action.error };
    case "DISCARD_REVIEW":
      return initialState;
  }
};

type ReviewContextValue = {
  state: ReviewState;
  addDraft: (body: string, position: DiffPosition) => void;
  removeDraft: (localId: string) => void;
  editDraft: (localId: string, body: string) => void;
  submitReview: (
    event: ReviewEvent,
    body?: string,
  ) => Promise<void>;
  discardReview: () => void;
};

const ReviewContext = createContext<ReviewContextValue | null>(null);

type ReviewProviderProps = {
  children: React.ReactNode;
  projectId: number;
  iid: number;
  diffRefs?: DiffRefs;
};

export const ReviewProvider = ({
  children,
  projectId,
  iid,
  diffRefs,
}: ReviewProviderProps) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const addDraft = useCallback((body: string, position: DiffPosition) => {
    dispatch({
      type: "ADD_DRAFT",
      draft: {
        localId: crypto.randomUUID(),
        body,
        position,
      },
    });
  }, []);

  const removeDraft = useCallback((localId: string) => {
    dispatch({ type: "REMOVE_DRAFT", localId });
  }, []);

  const editDraft = useCallback((localId: string, body: string) => {
    dispatch({ type: "EDIT_DRAFT", localId, body });
  }, []);

  const submitReview = useCallback(
    async (event: ReviewEvent, body?: string) => {
      dispatch({ type: "SUBMIT_START" });

      try {
        await submitReviewApi(projectId, iid, {
          event,
          body,
          comments: state.drafts,
          diffRefs,
        });
        dispatch({ type: "SUBMIT_SUCCESS" });
      } catch (error) {
        dispatch({
          type: "SUBMIT_ERROR",
          error:
            error instanceof Error
              ? error.message
              : "Failed to submit review",
        });
        throw error;
      }
    },
    [projectId, iid, state.drafts, diffRefs],
  );

  const discardReview = useCallback(() => {
    dispatch({ type: "DISCARD_REVIEW" });
  }, []);

  return (
    <ReviewContext.Provider
      value={{ state, addDraft, removeDraft, editDraft, submitReview, discardReview }}
    >
      {children}
    </ReviewContext.Provider>
  );
};

export const useReview = () => {
  const context = useContext(ReviewContext);

  if (!context) {
    throw new Error("useReview must be used within ReviewProvider");
  }

  return context;
};
