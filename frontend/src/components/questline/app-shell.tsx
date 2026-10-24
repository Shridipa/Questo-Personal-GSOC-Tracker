"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  BookOpen,
  CalendarDays,
  Compass,
  Flag,
  GitBranch,
  House,
  LogIn,
  LogOut,
  MoreHorizontal,
  Settings,
  Target,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth-context";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const mainNavigation: NavItem[] = [
  { href: "/", label: "My path", icon: House },
  { href: "/quests", label: "Quests", icon: Target },
  { href: "/explore", label: "Explore orgs", icon: Compass },
  { href: "/journeys", label: "My journeys", icon: GitBranch },
  { href: "/roadmap", label: "Roadmap", icon: Flag },
  { href: "/progress", label: "Progress", icon: Trophy },
];

const planningNavigation: NavItem[] = [
  { href: "/weekly-review", label: "Weekly review", icon: BookOpen },
  { href: "/deadlines", label: "Deadlines", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
];

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function subscribeToNetworkStatus(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getNetworkStatus() {
  return navigator.onLine;
}

function NavigationLinks({
  items,
  pathname,
  compact = false,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return items.map(({ href, label, icon: Icon }) => {
    // Sub-pages stay attached to their section (e.g. /explore/org → "Explore orgs").
    const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
    return (
      <Link
        aria-current={active ? "page" : undefined}
        className={`${compact ? "mobile-nav-link" : "sidebar-link"}${active ? " is-active" : ""}`}
        href={href}
        key={href}
        onClick={onNavigate}
        title={compact ? label : undefined}
      >
        <Icon aria-hidden="true" size={20} strokeWidth={2.2} />
        <span>{label}</span>
      </Link>
    );
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut, isLoading: authLoading } = useAuth();
  const [openMenuPath, setOpenMenuPath] = useState<string>();
  const moreOpen = openMenuPath === pathname;
  const isOnline = useSyncExternalStore(subscribeToNetworkStatus, getNetworkStatus, () => true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();
  const [supportError, setSupportError] = useState<string>();

  useEffect(() => {
    const handleInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleInstallAvailable);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/questline-sw.js").catch(() => {
        setSupportError(
          "Offline page support could not be started. You can still use Questo online.",
        );
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallAvailable);
    };
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuPath(undefined);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen]);

  const installApp = useCallback(async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(undefined);
    } catch {
      setSupportError(
        "The install prompt could not be opened. Use your browser menu to install Questo.",
      );
      setInstallPrompt(undefined);
    }
  }, [installPrompt]);

  // Auth routes render standalone — outside the dashboard shell
  const AUTH_ROUTES = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/auth/callback",
  ];
  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );

  if (isAuthRoute) {
    return <>{children}</>;
  }

  // `/` is auth-aware: while the session resolves (splash) or for signed-out
  // visitors (public landing page) it renders standalone, outside the app shell.
  const isStandaloneHome = pathname === "/" && (authLoading || !user);
  if (isStandaloneHome) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside aria-label="Main navigation" className="sidebar">
        <Link aria-label="Questo home" className="brand" href="/">
          <span aria-hidden="true" className="brand-mark">
            <Image alt="" height={386} src="/icons/questo-phoenix.png" width={579} />
          </span>
          <span className="brand-word">Questo</span>
        </Link>

        <div className="profile-card">
          <div aria-hidden="true" className="avatar">
            {user?.email ? user.email.slice(0, 1).toUpperCase() : "Q"}
          </div>
          <div className="profile-copy">
            <strong>
              {user?.user_metadata?.full_name ||
                (user?.email ? user.email.split("@")[0] : "Your learning journey")}
            </strong>
            <span>{user?.email ? "Cloud Synced" : "Local mode · Sign in to sync"}</span>
          </div>
        </div>

        <div style={{ padding: "0 1.25rem 0.75rem" }}>
          {user ? (
            <button
              className="button button-outline"
              onClick={() => void signOut()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                width: "100%",
                fontSize: "0.8125rem",
                padding: "0.4rem 0.65rem",
              }}
              type="button"
            >
              <LogOut size={14} />
              <span>Log out</span>
            </button>
          ) : (
            <Link
              className="button button-primary"
              href="/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                width: "100%",
                fontSize: "0.8125rem",
                padding: "0.45rem 0.65rem",
                textDecoration: "none",
              }}
            >
              <LogIn size={14} />
              <span>Sign in / Sync</span>
            </Link>
          )}
        </div>

        <nav aria-label="Learning" className="nav-section">
          <p className="nav-label">YOUR JOURNEY</p>
          <NavigationLinks items={mainNavigation} pathname={pathname} />
        </nav>
        <nav aria-label="Planning" className="nav-section planning-nav">
          <p className="nav-label">YOUR TOOLKIT</p>
          <NavigationLinks items={planningNavigation} pathname={pathname} />
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-encouragement">
            <div className="encouragement-icon">
              <Award size={19} />
            </div>
            <p>
              <strong>Small steps,</strong>
              <br />
              big open-source energy.
            </p>
            <span aria-hidden="true">✦</span>
          </div>
          <div className="sidebar-footnote">
            Made for your next big contribution <span>♡</span>
          </div>
        </div>
      </aside>

      <div className="app-column">
        {(supportError || !isOnline) && (
          <div className="offline-notice" role="status" aria-live="polite">
            <span>
              {supportError ??
                "You are offline. Saved data may be out of date; changes are not queued and must be confirmed by the API."}
            </span>
          </div>
        )}
        <header className="mobile-header">
          <Link aria-label="Questo home" className="brand" href="/">
            <span aria-hidden="true" className="brand-mark">
              <Image alt="" height={386} src="/icons/questo-phoenix.png" width={579} />
            </span>
            <span className="brand-word">Questo</span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {user ? (
              <Link
                href="/settings"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--foreground, inherit)",
                  textDecoration: "none",
                  padding: "0.3rem 0.6rem",
                  borderRadius: "999px",
                  background: "var(--surface-sunken, rgba(0,0,0,0.04))",
                  border: "1px solid var(--border-soft, #e2e8f0)",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: "#10b981",
                  }}
                />
                <span>{user.email?.split("@")[0]}</span>
              </Link>
            ) : (
              <Link
                className="button button-outline"
                href="/login"
                style={{
                  fontSize: "0.75rem",
                  padding: "0.25rem 0.6rem",
                  textDecoration: "none",
                }}
              >
                Sign in
              </Link>
            )}
            {installPrompt && (
              <button className="install-app-button" onClick={installApp} type="button">
                Install
              </button>
            )}
          </div>
        </header>

        <header className="status-bar">
          <div className="status-level">
            <span className="status-preview-note">
              {user
                ? `Signed in as ${user.email} · Cloud persistence active`
                : "Guest mode · Sign in to save and sync progress across devices"}
            </span>
          </div>
          <div className="status-right">
            {!user && (
              <Link
                className="button button-outline"
                href="/login"
                style={{
                  fontSize: "0.8125rem",
                  padding: "0.3rem 0.65rem",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <LogIn size={14} />
                <span>Sign in</span>
              </Link>
            )}
            {installPrompt && (
              <button className="install-app-button" onClick={installApp} type="button">
                Install Questo
              </button>
            )}
            <Link
              aria-label="Open settings"
              className="icon-button status-settings"
              href="/settings"
            >
              <Settings size={19} />
            </Link>
          </div>
        </header>

        <main className="main-content" id="main-content" tabIndex={-1}>
          {children}
        </main>

        <nav aria-label="Mobile navigation" className="mobile-bottom-nav">
          <NavigationLinks compact items={mainNavigation} pathname={pathname} />
          <button
            aria-controls="mobile-planning-navigation"
            aria-expanded={moreOpen}
            aria-label="More navigation"
            className={`mobile-nav-link${moreOpen || planningNavigation.some((item) => item.href === pathname) ? " is-active" : ""}`}
            onClick={() => setOpenMenuPath(moreOpen ? undefined : pathname)}
            type="button"
          >
            <MoreHorizontal aria-hidden="true" size={20} strokeWidth={2.2} />
            <span>More</span>
          </button>
          {moreOpen && (
            <div className="mobile-more-menu" id="mobile-planning-navigation">
              <NavigationLinks
                compact
                items={planningNavigation}
                onNavigate={() => setOpenMenuPath(undefined)}
                pathname={pathname}
              />
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
