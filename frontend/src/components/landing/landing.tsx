import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Flame,
  GitBranch,
  Map as MapIcon,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";

/* --------------------------------------------------------------------------
 * Public landing page (server component — no client JS beyond Next's own).
 * All product-preview content is clearly illustrative sample content.
 * ----------------------------------------------------------------------- */

function BirdBrand({ size = "nav" }: { size?: "nav" | "footer" }) {
  return (
    <span className="lp-brand" style={size === "footer" ? { fontSize: 19 } : undefined}>
      <Image alt="Questo bird logo" height={386} src="/icons/questo-phoenix.png" width={579} />
      Questo
    </span>
  );
}

function LandingNavbar() {
  return (
    <header className="lp-nav">
      <div className="lp-container lp-nav-inner">
        <Link aria-label="Questo home" href="/">
          <BirdBrand />
        </Link>
        <nav aria-label="Landing navigation" className="lp-nav-actions">
          <Link className="lp-nav-link" href="/quests">
            Preview App
          </Link>
          <a className="lp-nav-link" href="#how-it-works">
            How it works
          </a>
          <Link className="lp-nav-link" href="/login">
            Log in
          </Link>
          <Link
            className="lp-btn lp-btn-primary"
            href="/signup"
            style={{ minHeight: 44, fontSize: 16 }}
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

function ProductPreview() {
  return (
    <figure aria-label="Illustrative preview of the Questo app" className="lp-preview" role="img">
      <figcaption className="lp-preview-tag">Sample preview</figcaption>

      <div className="lp-preview-head">
        <h3>Your journey</h3>
        <span className="lp-streak-pill">
          <Flame aria-hidden="true" size={14} /> 5-day streak
        </span>
      </div>

      <div className="lp-preview-progress">
        <div aria-hidden="true" className="lp-preview-track">
          <span />
        </div>
        <small>3 of 7 quests complete · 250 XP earned</small>
      </div>

      <div className="lp-mini-roadmap" aria-hidden="true">
        <span className="lp-mini-step done">
          <i>✓</i> Foundations — set up your environment
        </span>
        <span className="lp-mini-step now">
          <i>2</i> Reproduce a documented issue
        </span>
        <span className="lp-mini-step todo">
          <i>3</i> Write a minimal regression test
        </span>
      </div>

      <div className="lp-mini-quest">
        <span>
          <strong>Next quest: Review Git branching &amp; pull requests</strong>
          <small>20 min · Learn</small>
        </span>
        <span className="lp-mini-xp">+10 XP</span>
      </div>

      <div className="lp-mini-deadline" aria-hidden="true">
        <i>
          <strong>12</strong>
          <small>Apr</small>
        </i>
        <p>
          <strong>Proposal draft target</strong>
          <span>Due in 5 days · personal deadline</span>
        </p>
      </div>
    </figure>
  );
}

function LandingHero() {
  return (
    <section className="lp-hero">
      <div className="lp-container lp-hero-grid">
        <div>
          <span className="lp-eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h1>Make your next big goal a daily habit.</h1>
          <p className="lp-hero-sub">
            Questo turns your open-source and career goals into a clear roadmap, daily quests, and
            progress you can actually see. Know what to do next, stay consistent, and build toward
            opportunities like GSoC.
          </p>
          <div className="lp-hero-ctas">
            <Link className="lp-btn lp-btn-primary" href="/signup">
              Start your journey <ArrowRight aria-hidden="true" size={18} />
            </Link>
            <Link className="lp-btn lp-btn-ghost" href="/quests">
              Explore as guest
            </Link>
            <a className="lp-btn lp-btn-ghost" href="#how-it-works">
              How it works
            </a>
          </div>
          <p className="lp-hero-reassurance">Your roadmap. Your pace. Your progress.</p>
        </div>
        <ProductPreview />
      </div>
    </section>
  );
}

function FeatureCards() {
  return (
    <section className="lp-section" id="what-questo-does">
      <div className="lp-container">
        <div className="lp-section-head">
          <h2>Big goals become easier when the next step is clear.</h2>
          <p>
            Instead of wondering what to work on next, Questo helps you turn a long-term goal into
            manageable actions you can complete one day at a time.
          </p>
        </div>
        <div className="lp-features">
          <article className="lp-feature">
            <span aria-hidden="true" className="lp-feature-icon">
              <MapIcon size={22} />
            </span>
            <h3>Your roadmap</h3>
            <p>
              Break your goal into clear milestones so you always know what to work toward next.
            </p>
            <div aria-hidden="true" className="lp-feature-visual">
              <span className="lp-visual-milestone">
                <i /> Foundations
              </span>
              <span className="lp-visual-milestone">
                <i /> First contribution
              </span>
              <span className="lp-visual-milestone pending">
                <i /> Application ready
              </span>
            </div>
          </article>
          <article className="lp-feature">
            <span aria-hidden="true" className="lp-feature-icon">
              <Target size={22} />
            </span>
            <h3>Daily quests</h3>
            <p>
              Turn your plan into manageable tasks, build consistency, and track progress you make.
            </p>
            <div aria-hidden="true" className="lp-feature-visual">
              <span className="lp-visual-quest">
                <span>Practice a small merge conflict</span>
                <span>+25 XP</span>
              </span>
              <span className="lp-visual-quest">
                <span>Choose a first issue</span>
                <span>Done ✓</span>
              </span>
            </div>
          </article>
          <article className="lp-feature">
            <span aria-hidden="true" className="lp-feature-icon">
              <CalendarDays size={22} />
            </span>
            <h3>Deadlines and weekly reviews</h3>
            <p>
              Keep important dates visible and reflect on what went well, what needs attention, and
              what comes next.
            </p>
            <div aria-hidden="true" className="lp-feature-visual">
              <span className="lp-visual-calendar">
                <span>M</span>
                <span>T</span>
                <span className="hot">W</span>
                <span>T</span>
                <span>F</span>
              </span>
              <span className="lp-visual-milestone">
                <i /> Week review saved · 3 wins recorded
              </span>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Choose your goal",
      body: "Know what you are working toward, whether it is GSoC preparation or a broader open-source learning journey.",
    },
    {
      title: "Complete your daily quests",
      body: "Follow manageable tasks, record your progress, and build a routine that fits your schedule.",
    },
    {
      title: "Review and keep moving",
      body: "Reflect on your week, check upcoming deadlines, and adjust your next steps.",
    },
  ];
  return (
    <section className="lp-section" id="how-it-works">
      <div className="lp-container">
        <div className="lp-section-head">
          <h2>A clearer path, one step at a time.</h2>
        </div>
        <div className="lp-steps">
          {steps.map((step, index) => (
            <article className="lp-step" key={step.title}>
              <span aria-hidden="true" className="lp-step-num">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExperienceSection() {
  return (
    <section className="lp-section">
      <div className="lp-container lp-experience">
        <div>
          <div className="lp-section-head" style={{ marginBottom: 0 }}>
            <h2>Everything you need to keep moving.</h2>
            <p>
              Roadmap, quests, deadlines, and weekly reflection live in one calm place — so progress
              is always visible and the next step is always obvious.
            </p>
          </div>
          <ul>
            <li>
              <GitBranch aria-hidden="true" size={19} /> A personal roadmap from foundations to your
              first meaningful pull request.
            </li>
            <li>
              <Target aria-hidden="true" size={19} /> Quests with checklists, notes, and XP awarded
              once — by the server, never faked.
            </li>
            <li>
              <CalendarDays aria-hidden="true" size={19} /> Personal deadlines with clear
              countdowns, kept separate from official program dates.
            </li>
            <li>
              <BookOpen aria-hidden="true" size={19} /> Weekly reviews that turn reflection into a
              realistic plan for next week.
            </li>
          </ul>
        </div>
        <div aria-hidden="true" className="lp-exp-panel">
          <div className="lp-exp-block">
            <h4>Roadmap</h4>
            <p className="lp-exp-row">
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>Foundations</span>
              <span>Current phase</span>
            </p>
            <p className="lp-exp-row">
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>
                First meaningful pull request
              </span>
              <span>Planned</span>
            </p>
          </div>
          <div className="lp-exp-block">
            <h4>Upcoming deadlines</h4>
            <p className="lp-exp-row">
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>Proposal draft target</span>
              <span>Apr 12 · in 5 days</span>
            </p>
          </div>
          <div className="lp-exp-block">
            <h4>This week</h4>
            <p className="lp-exp-row">
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>3 quests · 120 XP</span>
              <span>Review saved</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="lp-section" style={{ paddingTop: "1rem" }}>
      <div className="lp-container">
        <div className="lp-cta">
          <h2>Your next milestone starts with one step.</h2>
          <p>Give your goals a clear direction and make progress at your own pace.</p>
          <Link className="lp-btn lp-btn-primary" href="/signup">
            Get started with Questo <Sparkles aria-hidden="true" size={18} />
          </Link>
          <span className="lp-cta-login">
            Already have an account? <Link href="/login">Log in</Link>
          </span>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer-inner">
        <div className="lp-footer-brand">
          <BirdBrand size="footer" />
          <p>
            Questo turns open-source and career goals into a roadmap, daily quests, and progress you
            can see.
          </p>
        </div>
        <nav aria-label="Footer" className="lp-footer-links">
          <Link href="/login">Log in</Link>
          <Link href="/signup">Sign up</Link>
          <a
            href="https://github.com/Shridipa/Questo-Personal-GSOC-Tracker"
            rel="noopener noreferrer"
            target="_blank"
          >
            <Trophy aria-hidden="true" size={15} /> Project on GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="lp-page">
      <LandingNavbar />
      <main id="main-content">
        <LandingHero />
        <FeatureCards />
        <HowItWorks />
        <ExperienceSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
