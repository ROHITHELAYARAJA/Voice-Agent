"use client";
import * as Dialog from "@radix-ui/react-dialog";
import {
  XIcon,
  FlowerLotusIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Nila home">
      <FlowerLotusIcon weight="duotone" size={31} />
      <span>
        nila<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("nila-theme");
    const value = saved
      ? saved === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
  }, []);
  return (
    <button
      className="icon-button"
      aria-label={dark ? "Use light appearance" : "Use dark appearance"}
      onClick={() => {
        const value = !dark;
        setDark(value);
        document.documentElement.dataset.theme = value ? "dark" : "light";
        localStorage.setItem("nila-theme", value ? "dark" : "light");
      }}
    >
      {dark ? <SunIcon size={20} /> : <MoonIcon size={20} />}
    </button>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="row between">
            <Dialog.Title asChild>
              <h2>{title}</h2>
            </Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <XIcon size={22} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted">
            {description ?? "Review your changes before continuing."}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
  href,
  label,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty">
      <FlowerLotusIcon weight="duotone" size={34} />
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {action}
      {href && (
        <Link className="button secondary" href={href}>
          {label}
        </Link>
      )}
    </div>
  );
}
export function Skeleton() {
  return (
    <div
      className="dashboard-grid"
      aria-label="Loading your space"
      aria-busy="true"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div className="card skeleton" key={i}>
          <div />
          <div />
          <div />
        </div>
      ))}
    </div>
  );
}
