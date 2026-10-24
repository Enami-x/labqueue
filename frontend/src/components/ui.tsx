import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { useFeedback } from '../store/useFeedback';

export const PageHeader: React.FC<{
  kicker: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ kicker, title, description, actions }) => (
  <header className="page-head">
    <div>
      <span className="section-kicker">{kicker}</span>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>
);

export const SectionHeading: React.FC<{ kicker: string; title: React.ReactNode; actions?: React.ReactNode; id?: string }> = ({
  kicker,
  title,
  actions,
  id,
}) => (
  <div className="section-heading">
    <div>
      <span className="section-kicker">{kicker}</span>
      <h2 id={id}>{title}</h2>
    </div>
    {actions && <div className="heading-actions">{actions}</div>}
  </div>
);

/**
 * A label linked to its control via htmlFor/id. `children` receives the id
 * (and the hint id for aria-describedby).
 */
export const Field: React.FC<{
  label: React.ReactNode;
  hint?: React.ReactNode;
  errors?: string[];
  className?: string;
  children: (id: string, describedBy: string | undefined) => React.ReactNode;
}> = ({ label, hint, errors, className, children }) => {
  const id = useId();
  const hintId = hint || errors?.length ? `${id}-hint` : undefined;
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id, hintId)}
      {(hint || (errors && errors.length > 0)) && (
        <div id={hintId}>
          {hint && <span className="field-hint">{hint}</span>}
          <FieldErrors messages={errors} />
        </div>
      )}
    </div>
  );
};

export const FieldErrors: React.FC<{ messages?: string[] }> = ({ messages }) =>
  messages && messages.length ? (
    <ul className="field-error" role="alert" style={{ flexDirection: 'column' }}>
      {messages.map((m) => (
        <li key={m} style={{ display: 'flex', gap: 6 }}>
          <AlertTriangle /> <span>{m}</span>
        </li>
      ))}
    </ul>
  ) : null;

export const EmptyState: React.FC<{ icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }> = ({
  icon,
  children,
  action,
}) => (
  <div className="empty-state">
    {icon}
    <div>{children}</div>
    {action}
  </div>
);

export const Skeleton: React.FC<{ height?: number; width?: string | number; className?: string }> = ({
  height = 16,
  width = '100%',
  className,
}) => <div className={`skeleton ${className ?? ''}`} style={{ height, width }} aria-hidden="true" />;

export const SkeletonCards: React.FC<{ count?: number; height?: number }> = ({ count = 6, height = 170 }) => (
  <div className="card-grid" aria-busy="true" aria-label="Loading">
    {Array.from({ length: count }, (_, i) => (
      <Skeleton key={i} height={height} />
    ))}
  </div>
);

/** Shows a spinner in place of the icon while `busy`. */
export const BusyIcon: React.FC<{ busy: boolean; icon: React.ReactNode }> = ({ busy, icon }) =>
  busy ? <Loader2 className="spinner" aria-hidden="true" /> : <>{icon}</>;

const TOAST_ICON = {
  success: <CheckCircle2 aria-hidden="true" />,
  error: <AlertTriangle aria-hidden="true" />,
  info: <Info aria-hidden="true" />,
};

export const Toaster: React.FC = () => {
  const { toasts, dismiss } = useFeedback();
  return (
    <div className="toast-region" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          {TOAST_ICON[t.kind]}
          <div className="toast-body">
            <b>{t.title}</b>
            {t.details && t.details.length > 0 && (
              <ul>
                {t.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
            <X />
          </button>
        </div>
      ))}
    </div>
  );
};

export const ConfirmDialog: React.FC = () => {
  const req = useFeedback((s) => s.confirmRequest);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!req) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') req.resolve(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [req]);

  if (!req) return null;
  return (
    <div className="modal-backdrop" onClick={() => req.resolve(false)}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{req.title}</h2>
        <p>{req.body}</p>
        <div className="modal-actions">
          <button ref={cancelRef} className="ghost-button" style={{ padding: '8px 14px' }} onClick={() => req.resolve(false)}>
            Cancel
          </button>
          <button className={req.danger ? 'danger-button' : 'primary-button'} onClick={() => req.resolve(true)}>
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
