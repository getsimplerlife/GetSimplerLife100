import React from "react";
import { Link } from "@tanstack/react-router";
import { PortalIcon, type PortalIconName } from "~/components/PortalIcons";

/**
 * ── SLICE 199 — ONE component set for the whole portal ───────────────────────
 *
 * The owner's directive (2026-11-06): *"keep the dark emerald look. just make it
 * consistent on every page and improve the visual aspect of search bars and
 * buttons all around."*
 *
 * So this file is the single place a control is defined. It is not a redesign:
 * the palette is untouched (stone surfaces, emerald identity), and everything
 * here is expressed in the dark values the product actually renders, because
 * `index.html` hardcodes `<html class="dark">` — there is no light mode, and a
 * light-mode default class is therefore a bug that is always on screen.
 *
 * What this slice changed, and why (each was measured in source, not guessed):
 *
 *  1. `Button primary` carried `shadow-emerald-100` — a pale mint (#d1fae5)
 *     glow with no `dark:` override, so every primary button on the near-black
 *     portal wore a light-mode halo. Same for `danger` with `shadow-rose-100`.
 *     Shadows are now dark-correct (or gone).
 *  2. `focus:ring-2 focus:ring-offset-2` had no ring-offset COLOUR, so a focused
 *     button drew a white ring around itself. It is now `focus-visible` (a mouse
 *     click no longer paints a ring) with an explicit `ring-offset-stone-950`.
 *  3. `variant="success"` was byte-identical to `primary`. The component encoded
 *     the colour collision that once made a failed approval render as success.
 *     **The `success` button variant is DELETED.** Success is a status, not an
 *     action: it belongs on `Badge`/`Alert`, never on a fill.
 *  4. `Button` had no default `type`, so any button inside a `<form>` submitted
 *     it. It now defaults to `type="button"`.
 *  5. `Input` had no placeholder colour at all — the browser's mid-grey read as
 *     typed text on `bg-stone-950` (sweep P4-1).
 *  6. The search page hand-rolled its own input (`portal.search.index.page.tsx`),
 *     so the product had two search-bar looks. `SearchInput` is now the only one.
 *
 * `src/test/portal-ui-system-199.test.ts` guards all of the above at source and
 * fails the build if a portal page hand-rolls a raw `<button>`/`<input>` again.
 */

// ==========================================
// TOKENS
// ==========================================
/**
 * The semantic tokens live in `src/styles/app.css` (`@theme`). These names are
 * re-exported here so a component or a test refers to the token, never to a
 * literal colour: `--color-cta` is the action fill, `--color-success` is a
 * STATUS. They are deliberately different values, and `portal-ui-system-199`
 * fails if they ever collapse back into one.
 */
export const TOKENS = {
  cta: "var(--color-cta)",
  ctaHover: "var(--color-cta-hover)",
  success: "var(--color-success)",
  danger: "var(--color-danger)",
  warning: "var(--color-warning)",
} as const;

// ==========================================
// SPINNER
// ==========================================
export const Spinner: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    className={`animate-spin h-4 w-4 ${className}`}
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

// ==========================================
// BUTTON COMPONENT
// ==========================================
/**
 * Five variants, one job each. There is no `success` variant on purpose — see
 * the file header. A destructive action is `danger`; a status is a `Badge`.
 */
export const BUTTON_VARIANTS = ["primary", "secondary", "outline", "ghost", "danger"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export const BUTTON_SIZES = ["sm", "md", "lg"] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

/** One fixed height per size, so buttons line up across pages. */
const BUTTON_SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  // The action fill. The glow is emerald on near-black — a dark shadow, not a
  // light-mode `shadow-emerald-100` halo.
  primary:
    "bg-cta text-white hover:bg-cta-hover shadow-[0_6px_16px_-10px_rgba(5,150,105,0.9)] active:scale-[0.98]",
  secondary:
    "bg-stone-800 text-stone-100 border border-stone-700 hover:bg-stone-700 hover:border-stone-600 active:scale-[0.98]",
  outline:
    "bg-transparent text-stone-200 border border-stone-700 hover:bg-stone-900 hover:border-stone-500 active:scale-[0.98]",
  ghost:
    "bg-transparent text-stone-300 hover:bg-stone-800 hover:text-stone-100 active:scale-[0.98]",
  // Destructive actions do not bounce: no `active:scale` on the one variant that
  // can lose data.
  danger:
    "bg-danger text-white hover:bg-danger-hover shadow-[0_6px_16px_-10px_rgba(225,29,72,0.9)]",
};

const BUTTON_BASE =
  "relative inline-flex items-center justify-center font-bold rounded-xl select-none " +
  "transition-colors duration-150 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-stone-950 " +
  "disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none disabled:scale-100";

/**
 * The button's class string, for the one case a button cannot be used: a
 * router `<Link>`. A `<button>` nested inside an `<a>` is invalid HTML, so a
 * link that must look like a button gets the same classes instead of a copy of
 * them.
 */
export function buttonClass(opts: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  const { variant = "primary", size = "md", className = "" } = opts;
  return `${BUTTON_BASE} ${BUTTON_VARIANT_CLASS[variant]} ${BUTTON_SIZE_CLASS[size]} ${className}`;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  type = "button",
  ...props
}) => {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
      className={buttonClass({ variant, size, className })}
    >
      {/* The spinner is absolutely positioned and the children stay in the
          layout (invisible, `display: contents`), so going into `loading` never
          re-flows the page. */}
      {loading && <Spinner className="absolute inset-0 m-auto" />}
      <span className={loading ? "invisible contents" : "contents"}>{children}</span>
    </button>
  );
};

// ==========================================
// CARD COMPONENT
// ==========================================
interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  /** Optional DOM id (e.g. a scroll target for empty-state CTAs). */
  id?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = "", onClick, id }) => {
  return (
    <div
      id={id}
      onClick={onClick}
      className={`bg-stone-900 border border-stone-800 rounded-3xl shadow-sm hover:border-stone-700 transition-colors duration-200 ${onClick ? "cursor-pointer active:scale-[0.99]" : ""} ${className}`}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`p-6 border-b border-stone-800 ${className}`}>{children}</div>
);

export const CardBody: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`p-6 border-t border-stone-800 bg-stone-950/40 rounded-b-3xl ${className}`}>{children}</div>
);

// ==========================================
// BADGE COMPONENT — a STATUS, never an action
// ==========================================
/**
 * `emerald` and `success` used to be the same string, and the DEFAULT was
 * `emerald` — so any status a page did not classify rendered brand green, which
 * is how a failed approval looked like a success. The default is now `stone`
 * ("unclassified"), and `success` is the one explicit positive status.
 */
export const BADGE_VARIANTS = ["success", "warning", "danger", "stone", "blue", "violet"] as const;
export type BadgeVariant = (typeof BADGE_VARIANTS)[number];

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const BADGE_CLASS: Record<BadgeVariant, string> = {
  success: "bg-emerald-950/50 text-emerald-300 border border-emerald-800/60",
  warning: "bg-amber-950/50 text-amber-300 border border-amber-800/60",
  danger: "bg-rose-950/50 text-rose-300 border border-rose-800/60",
  stone: "bg-stone-900 text-stone-300 border border-stone-800",
  blue: "bg-sky-950/50 text-sky-300 border border-sky-800/60",
  violet: "bg-violet-950/50 text-violet-300 border border-violet-800/60",
};

export const Badge: React.FC<BadgeProps> = ({ variant = "stone", children, className = "" }) => {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap ${BADGE_CLASS[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

// ==========================================
// ALERT — one look for every inline error/warning/notice
// ==========================================
export type AlertVariant = "error" | "warning" | "info" | "success";

const ALERT_CLASS: Record<AlertVariant, string> = {
  error: "border-rose-800/60 bg-rose-950/40 text-rose-100",
  warning: "border-amber-800/60 bg-amber-950/40 text-amber-100",
  info: "border-stone-800 bg-stone-900 text-stone-200",
  success: "border-emerald-800/60 bg-emerald-950/40 text-emerald-100",
};

interface AlertProps {
  variant?: AlertVariant;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = "error",
  title,
  children,
  action,
  className = "",
}) => (
  <div
    role={variant === "error" ? "alert" : "status"}
    className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between ${ALERT_CLASS[variant]} ${className}`}
  >
    <div className="min-w-0">
      {title && <div className="font-bold">{title}</div>}
      {children && <div className="mt-1 text-xs leading-relaxed opacity-90 break-words">{children}</div>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

// ==========================================
// INPUT COMPONENT
// ==========================================
/** The one field skin. Dark-only: `bg-stone-950` on a `stone-800` hairline. */
export const INPUT_CLASS =
  "w-full min-h-[44px] px-4 py-3 rounded-xl border bg-stone-950 text-stone-100 text-sm font-medium " +
  "placeholder:text-stone-500 border-stone-800 hover:border-stone-700 " +
  "focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 " +
  "transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const INPUT_ERROR_CLASS =
  "border-rose-700 text-rose-100 placeholder:text-rose-300/60 focus:border-rose-500 focus:ring-rose-500/25";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  helperText,
  error,
  id,
  className = "",
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-bold text-stone-300 mb-1.5">
          {label}
        </label>
      )}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        className={`${INPUT_CLASS} ${error ? INPUT_ERROR_CLASS : ""} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs font-bold text-rose-300">{error}</p>}
      {helperText && !error && <p className="mt-1 text-xs font-medium text-stone-400">{helperText}</p>}
    </div>
  );
};

// ==========================================
// SEARCH INPUT — the ONE search bar
// ==========================================
interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "size"> {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name. Rendered visually-hidden, so every search field has one. */
  label?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Classes for the wrapper, for search bars that sit in a flex row. */
  wrapperClassName?: string;
  /** `sm` is the compact top-bar field; `md` is a page-level search bar. */
  size?: "sm" | "md";
}

/**
 * Built on the `Input` skin (same border, same focus ring, same placeholder
 * colour) plus the three things a search field needs and the hand-rolled one at
 * `portal.search.index.page.tsx:90` had only some of: a leading magnifier, a
 * real clear button with an accessible name, and `type="search"`.
 * Full width, 44 px tall minimum — one-hand usable at 390 px.
 */
export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  label = "Search",
  inputRef,
  className = "",
  wrapperClassName = "",
  size = "md",
  ...props
}) => {
  const compact = size === "sm";
  return (
    <div className={`relative w-full ${wrapperClassName}`}>
      <PortalIcon
        name="search"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-stone-500 ${
          compact ? "left-3 h-3.5 w-3.5" : "left-4 h-4 w-4"
        }`}
      />
      <input
        {...props}
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          props.onKeyDown?.(e);
          if (e.key === "Escape" && value) onChange("");
        }}
        aria-label={label}
        className={`${compact ? "min-h-[36px] py-1.5 text-xs" : ""} ${INPUT_CLASS} ${
          compact ? "pl-9 pr-9" : `pl-11 ${value ? "pr-12" : "pr-4"}`
        } font-semibold ${className}`}
      />
      {value !== "" && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className={`absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
            compact ? "h-7 w-7" : "h-9 w-9"
          }`}
        >
          <svg className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};

// ==========================================
// PAGE HEADER — every portal page, same shape
// ==========================================
interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** A `PortalIconName`, or any node when a page needs something bespoke. */
  icon?: PortalIconName | React.ReactNode;
  eyebrow?: React.ReactNode;
  /** Right-hand slot: primary action, filter, count. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * One header shape for every portal page: optional icon tile, an eyebrow, an
 * `h1`, a subtitle, and a right-hand actions slot that stacks under the title at
 * 390 px instead of squashing it.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  eyebrow,
  actions,
  className = "",
}) => {
  const iconNode =
    typeof icon === "string" ? (
      <PortalIcon name={icon as PortalIconName} className="h-5 w-5" />
    ) : (
      icon
    );

  return (
    <header
      className={`flex flex-col gap-4 border-b border-stone-900 pb-5 sm:flex-row sm:items-start sm:justify-between ${className}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {iconNode && (
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-900/60 bg-emerald-950/40 text-emerald-400">
            {iconNode}
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h1 className="text-2xl font-black tracking-tight text-white break-words sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-stone-400">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
};

// ==========================================
// EMPTY STATE — one component, no emoji
// ==========================================
interface EmptyStateProps {
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

/**
 * The single empty-state block. The old one carried an optional emoji `icon`
 * prop that no page ever passed — a feature that existed only in the type. It
 * is gone: every empty state looks the same, and that is the point.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  body,
  action,
  compact = false,
  className = "",
}) => (
  <div
    className={`rounded-2xl border border-dashed border-stone-800 text-center ${compact ? "px-4 py-8" : "px-6 py-12"} ${className}`}
  >
    <p className="text-sm font-bold text-stone-300">{title}</p>
    {body && (
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-stone-500">{body}</p>
    )}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

// ==========================================
// LIST ROW — stacks at 390 px, never squashes
// ==========================================
interface ListRowProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  id?: string;
}

export const ListRow: React.FC<ListRowProps> = ({ children, className = "", onClick, id }) => (
  <div
    id={id}
    onClick={onClick}
    className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 ${
      onClick ? "cursor-pointer transition-colors hover:bg-stone-900/60" : ""
    } ${className}`}
  >
    {children}
  </div>
);

// ==========================================
// MODAL COMPONENT
// ==========================================
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto no-print">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-3xl bg-stone-900 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-stone-800 animate-in fade-in zoom-in-95 duration-200">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800">
            {title ? (
              <h3 className="text-lg font-black text-white">{title}</h3>
            ) : <div />}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-lg p-1 text-stone-400 hover:bg-stone-800 hover:text-stone-200 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Modal Content */}
          <div className="px-6 py-6">{children}</div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// TABS COMPONENT
// ==========================================
interface TabItem {
  id: string;
  label: string;
  icon?: string;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange }) => {
  return (
    <div className="flex gap-1 bg-stone-900/80 p-1.5 rounded-2xl border border-stone-800 w-fit max-w-full overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
            activeTab === tab.id
              ? "bg-stone-950 text-emerald-400 shadow-sm"
              : "text-stone-400 hover:text-stone-100"
          }`}
        >
          {tab.icon && <span>{tab.icon}</span>}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

// ==========================================
// SIDEBAR COMPONENT
// ==========================================
interface SidebarItemProps {
  to: string;
  icon: string;
  label: string;
  active?: boolean;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({ to, icon, label, active = false }) => {
  return (
    <Link
      to={to as any}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all duration-150 ${
        active
          ? "bg-cta text-white shadow-[0_6px_16px_-10px_rgba(5,150,105,0.9)]"
          : "text-stone-400 hover:bg-stone-800/50 hover:text-emerald-400"
      }`}
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </Link>
  );
};

interface SidebarProps {
  brandName?: string;
  userEmail?: string;
  onLogout: () => void;
  children: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  brandName = "Simpler Life 100",
  userEmail,
  onLogout,
  children,
}) => {
  return (
    <aside className="w-64 bg-stone-900 border-r border-stone-800 flex flex-col h-screen fixed top-0 left-0 z-40">
      {/* Brand Logo */}
      <div className="p-6 border-b border-stone-800">
        <Link to="/" className="text-2xl font-black text-emerald-400 tracking-tight block">
          {brandName}
        </Link>
      </div>

      {/* Sidebar Links */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {children}
      </nav>

      {/* User Session Info / Logout */}
      <div className="p-4 border-t border-stone-800 bg-stone-950/40">
        {userEmail && (
          <div className="px-4 py-2 mb-2">
            <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider">Logged In As</p>
            <p className="text-xs font-bold text-stone-300 truncate">{userEmail}</p>
          </div>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 transition-colors text-left"
        >
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

// ==========================================
// ANIMATED NUMBER COMPONENT
// ==========================================
interface AnimatedNumberProps {
  value: string | number;
  duration?: number;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value, duration = 1200 }) => {
  const [displayValue, setDisplayValue] = React.useState<string | number>(value);

  React.useEffect(() => {
    const valueStr = String(value);
    // Parse numeric parts out
    const numMatch = valueStr.match(/[\d.]+/g);
    if (!numMatch) {
      setDisplayValue(value);
      return;
    }

    const numericPart = numMatch[0];
    const rawNum = parseFloat(numericPart.replace(/,/g, ""));
    if (isNaN(rawNum)) {
      setDisplayValue(value);
      return;
    }

    // Capture prefix and suffix
    const splitParts = valueStr.split(numericPart);
    const prefix = splitParts[0] || "";
    const suffix = splitParts[1] || "";

    const startTime = performance.now();

    let animFrameId: number;

    const updateNumber = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function: easeOutExpo
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const currentVal = rawNum * easeProgress;

      // Format based on decimal presence or comma presence
      let formattedNum = "";
      if (numericPart.includes(".")) {
        formattedNum = currentVal.toFixed(1);
      } else {
        formattedNum = Math.floor(currentVal).toString();
      }

      if (valueStr.includes(",")) {
        // Add thousands separators
        formattedNum = formattedNum.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      }

      setDisplayValue(`${prefix}${formattedNum}${suffix}`);

      if (progress < 1) {
        animFrameId = requestAnimationFrame(updateNumber);
      }
    };

    animFrameId = requestAnimationFrame(updateNumber);

    return () => cancelAnimationFrame(animFrameId);
  }, [value, duration]);

  return <span>{displayValue}</span>;
};
