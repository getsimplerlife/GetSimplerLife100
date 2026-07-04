import React from "react";
import { Link } from "@tanstack/react-router";

// ==========================================
// BUTTON COMPONENT
// ==========================================
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}) => {
  const baseStyle = "inline-flex items-center justify-center font-bold rounded-xl transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:scale-100";
  
  const variants = {
    primary: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-100 focus:ring-emerald-500",
    secondary: "bg-stone-100 hover:bg-stone-200 text-stone-800 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-100 focus:ring-stone-400",
    outline: "bg-transparent border-2 border-stone-200 hover:border-stone-300 text-stone-700 dark:border-stone-700 dark:hover:border-stone-600 dark:text-stone-200 focus:ring-stone-400",
    ghost: "bg-transparent hover:bg-stone-100 text-stone-600 dark:hover:bg-stone-800 dark:text-stone-300 focus:ring-stone-400",
    danger: "bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-100 focus:ring-rose-500",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-100 focus:ring-emerald-500",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-8 py-4 text-base",
  };

  return (
    <button
      disabled={disabled || loading}
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
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
}

export const Card: React.FC<CardProps> = ({ children, className = "", onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 ${onClick ? "cursor-pointer active:scale-[0.99]" : ""} ${className}`}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`p-6 border-b border-stone-50 dark:border-stone-800 ${className}`}>{children}</div>
);

export const CardBody: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`p-6 border-t border-stone-50 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 rounded-b-3xl ${className}`}>{children}</div>
);

// ==========================================
// BADGE COMPONENT
// ==========================================
interface BadgeProps {
  variant?: "emerald" | "success" | "warning" | "danger" | "stone" | "blue" | "violet";
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant = "emerald", children, className = "" }) => {
  const styles: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/30",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/30",
    warning: "bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/30",
    danger: "bg-rose-50 text-rose-700 border border-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800/30",
    stone: "bg-stone-100 text-stone-700 border border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
    slate: "bg-stone-100 text-stone-700 border border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
    blue: "bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/30",
    violet: "bg-violet-50 text-violet-700 border border-violet-100 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800/30",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${styles[variant]} ${className}`}>
      {children}
    </span>
  );
};

// ==========================================
// INPUT COMPONENT
// ==========================================
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
        <label htmlFor={id} className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm shadow-sm ${error ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20" : ""} ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-xs text-rose-600 font-bold">{error}</p>
      )}
      {helperText && !error && (
        <p className="mt-1 text-xs text-stone-400 font-medium">{helperText}</p>
      )}
    </div>
  );
};

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
        className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-3xl bg-white dark:bg-stone-900 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-stone-100 dark:border-stone-800 animate-in fade-in zoom-in-95 duration-200">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-stone-50 dark:border-stone-800">
            {title ? (
              <h3 className="text-lg font-black text-stone-900 dark:text-white">{title}</h3>
            ) : <div />}
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-500 focus:outline-none transition-colors"
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
    <div className="flex gap-1 bg-stone-100/80 dark:bg-stone-800/50 p-1.5 rounded-2xl border border-stone-100 dark:border-stone-800/30 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === tab.id
              ? "bg-white dark:bg-stone-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
              : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
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
          ? "bg-emerald-600 text-white shadow-md shadow-emerald-100 dark:shadow-none"
          : "text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/50 hover:text-emerald-600"
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
    <aside className="w-64 bg-white dark:bg-stone-900 border-r border-stone-100 dark:border-stone-800 flex flex-col h-screen fixed top-0 left-0 z-40">
      {/* Brand Logo */}
      <div className="p-6 border-b border-stone-100 dark:border-stone-800">
        <Link to="/" className="text-2xl font-black text-emerald-600 tracking-tight block">
          {brandName}
        </Link>
      </div>

      {/* Sidebar Links */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {children}
      </nav>

      {/* User Session Info / Logout */}
      <div className="p-4 border-t border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50">
        {userEmail && (
          <div className="px-4 py-2 mb-2">
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Logged In As</p>
            <p className="text-xs font-bold text-stone-700 dark:text-stone-300 truncate">{userEmail}</p>
          </div>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-700 transition-all text-left"
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
