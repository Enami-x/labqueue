import { create } from 'zustand';
import { ApiError } from '../services/api';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  details?: string[];
}

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface FeedbackState {
  toasts: Toast[];
  confirmRequest: ConfirmRequest | null;
  push: (kind: ToastKind, title: string, details?: string[]) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useFeedback = create<FeedbackState>((set, get) => ({
  toasts: [],
  confirmRequest: null,
  push: (kind, title, details) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-3), { id, kind, title, details }] });
    // Errors stay until dismissed; success/info clear themselves.
    if (kind !== 'error') setTimeout(() => get().dismiss(id), 4500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (title: string, details?: string[]) => useFeedback.getState().push('success', title, details),
  info: (title: string, details?: string[]) => useFeedback.getState().push('info', title, details),
  error: (title: string, err?: unknown) => {
    const details =
      err instanceof ApiError && err.fieldErrors.length
        ? err.fieldErrors.map((f) => f.msg)
        : err instanceof Error && err.message
          ? [err.message]
          : undefined;
    useFeedback.getState().push('error', title, details);
  },
};

/** Ask the user to confirm an action in an in-app dialog. Resolves true on confirm. */
export function confirmAction(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    useFeedback.setState({
      confirmRequest: {
        ...opts,
        resolve: (ok) => {
          useFeedback.setState({ confirmRequest: null });
          resolve(ok);
        },
      },
    });
  });
}
