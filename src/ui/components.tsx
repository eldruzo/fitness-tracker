import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { t, type MessageKey } from '../i18n';
import type { DayStatus } from '../lib/types';
import { Icon, StatusGlyph, type IconName } from './icons';

export function Stamp({ children, accent, title }: { children: ComponentChildren; accent?: boolean; title?: string }) {
  return (
    <span class={`stamp${accent ? ' stamp-accent' : ''}`} title={title}>
      {children}
    </span>
  );
}

export function StatusLabel({ status, compact }: { status: DayStatus; compact?: boolean }) {
  return (
    <span class={`status status-${status}`}>
      <StatusGlyph status={status} />
      <span class={compact ? 'visually-hidden' : undefined}>{t(`status.${status}` as MessageKey)}</span>
    </span>
  );
}

export function Banner({
  label,
  children,
  actions,
  tone = 'neutral',
  live,
  icon,
  onClose,
  closeLabel,
}: {
  label?: string;
  children: ComponentChildren;
  actions?: ComponentChildren;
  tone?: 'neutral' | 'error' | 'accent';
  /** announce politely to screen readers when it appears */
  live?: boolean;
  icon?: IconName;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <section class={`banner banner-${tone}`} role={live ? 'status' : undefined} aria-live={live ? 'polite' : undefined}>
      <div class="banner-body">
        {icon && <Icon name={icon} size={20} class="banner-icon" />}
        <div class="banner-text">
          {label && <p class="banner-label">{label}</p>}
          <div>{children}</div>
        </div>
        {onClose && (
          <button type="button" class="icon-btn banner-close" onClick={onClose} aria-label={closeLabel ?? t('common.dismiss')}>
            <Icon name="close" size={20} />
          </button>
        )}
      </div>
      {actions && <div class="banner-actions">{actions}</div>}
    </section>
  );
}

export function Button({
  children,
  variant = 'secondary',
  icon,
  class: cls,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'icon'> & {
  variant?: 'primary' | 'secondary' | 'text' | 'danger';
  icon?: IconName;
}) {
  return (
    <button type="button" class={`btn btn-${variant} ${cls ?? ''}`} {...rest}>
      {icon && <Icon name={icon} size={20} />}
      <span>{children}</span>
    </button>
  );
}

/** Accessible modal built on <dialog> (native focus trap and Escape to close). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ComponentChildren;
  actions?: ComponentChildren;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      class={`dialog${wide ? ' dialog-wide' : ''}`}
      aria-labelledby={`${id}-t`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <div class="dialog-inner">
          <header class="dialog-head">
            <h2 id={`${id}-t`}>{title}</h2>
            <button type="button" class="icon-btn" onClick={onClose} aria-label={t('common.close')}>
              <Icon name="close" />
            </button>
          </header>
          <div class="dialog-body">{children}</div>
          {actions && <footer class="dialog-actions">{actions}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** Confirmation that optionally requires typing a word (e.g. RESET). */
export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  typed,
  danger,
}: {
  open: boolean;
  title: string;
  body: ComponentChildren;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  typed?: string;
  danger?: boolean;
}) {
  const [text, setText] = useState('');
  const id = useId();
  useEffect(() => setText(''), [open]);
  const ok = !typed || text.trim().toUpperCase() === typed.toUpperCase();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={!ok}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div class="prose">{body}</div>
      {typed && (
        <div class="field">
          <label for={id}>{t('common.typeToConfirm', { word: typed })}</label>
          <input id={id} class="input" value={text} autocomplete="off" onInput={(e) => setText(e.currentTarget.value)} />
        </div>
      )}
    </Dialog>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div class="toggle-row">
      <label for={id} class="toggle-label">
        <span>{label}</span>
        {hint && <span class="hint" id={`${id}-h`}>{hint}</span>}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        class="switch"
        checked={checked}
        aria-describedby={hint ? `${id}-h` : undefined}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={o.value === value}
          class={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
          key={o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="empty">
      <p class="empty-title">{title}</p>
      {children && <div class="empty-body">{children}</div>}
      {action && <div class="empty-action">{action}</div>}
    </div>
  );
}

/** Text download without third-party libraries. */
export function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
