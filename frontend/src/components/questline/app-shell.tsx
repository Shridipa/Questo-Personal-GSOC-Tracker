"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  BookOpen,
  CalendarDays,
  Flag,
  House,
  MoreHorizontal,
  Settings,
  Target,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const mainNavigation: NavItem[] = [
  { href: "/", label: "My path", icon: House },
  { href: "/quests", label: "Quests", icon: Target },
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
    const active = pathname === href;
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
            Q
          </div>
          <div className="profile-copy">
            <strong>Your learning journey</strong>
            <span>Future open-source builder</span>
          </div>
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
          {installPrompt && (
            <button className="install-app-button" onClick={installApp} type="button">
              Install app
            </button>
          )}
          <span className="mobile-preview-tag">Questo</span>
        </header>

        <header className="status-bar">
          <div className="status-level">
            <span className="status-preview-note">
              Saved quest completion, XP, and streak data are available on your path.
            </span>
          </div>
          <div className="status-right">
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
