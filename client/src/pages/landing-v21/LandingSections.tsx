import { LandingLink } from "./LandingLink";

// Approved V21 content converted into semantic React markup. No production data.

export function LandingNavigation() {
  return (
    <>
      <header className="nav-wrap">
        <div className="container">
          <nav className="nav" aria-label="Primary navigation">
            <LandingLink className="brand" href="#main-content" aria-label="SQR — home" data-testid="landing-brand-title">
              <span className="brand-mark">
                SQR
              </span>
              <span>
                Sumbangan Query Rahmah
              </span>
            </LandingLink>
            <div className="nav-links">
              <LandingLink href="#features">
                Features
              </LandingLink>
              <LandingLink href="#security">
                Security
              </LandingLink>
              <LandingLink href="#about">
                About
              </LandingLink>
            </div>
            <div className="nav-actions">
              <LandingLink className="btn btn-ghost" href="#features">
                Explore
              </LandingLink>
              <LandingLink className="btn btn-primary" href="/login">
                Sign In
              </LandingLink>
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}

export function HeroIntro() {
  return (
    <>
      <div className="eyebrow">
        <span className="dot" aria-hidden="true"></span>
         SQR Operations Platform
      </div>
      <h1>
        Operational data, structured
        <br />
        for faster decisions.
      </h1>
      <p>
        SQR consolidates search, analysis, monitoring and access control into a single operational workspace designed for clarity, speed and governance.
      </p>
      <div className="hero-actions">
        <LandingLink className="btn btn-primary" href="/login" aria-label="Sign in to SQR">
          Sign In
        </LandingLink>
        <LandingLink className="btn btn-ghost" href="#product-preview">
          View the Platform
        </LandingLink>
      </div>
      <div className="micro">
        Lightweight · Responsive · Built for structured daily operations
      </div>
      <div className="hero-proof" aria-label="Platform strengths">
        <div className="hero-proof-item">
          <span>
            01
          </span>
          <div>
            <b>
              Unified Workspace
            </b>
            <small>
              Core operational functions remain within one consistent interface.
            </small>
          </div>
        </div>
        <div className="hero-proof-item">
          <span>
            02
          </span>
          <div>
            <b>
              Operational Search
            </b>
            <small>
              Retrieve and review records through a focused search workflow.
            </small>
          </div>
        </div>
        <div className="hero-proof-item">
          <span>
            03
          </span>
          <div>
            <b>
              Structured Analysis
            </b>
            <small>
              Turn operational data into clearer review and decision context.
            </small>
          </div>
        </div>
        <div className="hero-proof-item">
          <span>
            04
          </span>
          <div>
            <b>
              Controlled Access
            </b>
            <small>
              Role permissions, 2FA and session controls support stronger governance.
            </small>
          </div>
        </div>
      </div>
    </>
  );
}

export function WorkflowSection() {
  return (
    <>
      <section id="workflow" className="workflow-section">
        <div className="container">
          <div className="workflow-head">
            <div>
              <div className="eyebrow">
                How SQR works
              </div>
              <h2>
                A clear operational flow from data to action.
              </h2>
            </div>
            <p>
              SQR keeps the working process straightforward: bring data into the platform, retrieve and analyse what matters, then monitor activity and control access through the same environment.
            </p>
          </div>
          <div className="workflow-grid">
            <article className="workflow-step">
              <div className="workflow-index">
                01
              </div>
              <div className="workflow-icon" aria-hidden="true">
                ⇧
              </div>
              <h3>
                Bring data into SQR
              </h3>
              <p>
                Import approved data sources into a structured workspace where information can be reviewed consistently.
              </p>
              <div className="workflow-ui">
                <div className="workflow-file">
                  <span className="workflow-file-icon">
                    XLS
                  </span>
                  <div>
                    <b>
                      Operational dataset
                    </b>
                    <small>
                      Ready for processing
                    </small>
                  </div>
                  <span className="workflow-state">
                    Ready
                  </span>
                </div>
                <div className="workflow-progress">
                  <i></i>
                </div>
              </div>
            </article>
            <article className="workflow-step">
              <div className="workflow-index">
                02
              </div>
              <div className="workflow-icon" aria-hidden="true">
                ⌕
              </div>
              <h3>
                Search and analyse
              </h3>
              <p>
                Retrieve relevant records quickly, review structured information and surface data quality or operational context.
              </p>
              <div className="workflow-ui">
                <div className="workflow-search">
                  <span aria-hidden="true">
                    ⌕
                  </span>
                  <span>
                    Search operational records
                  </span>
                </div>
                <div className="workflow-result">
                  <span></span>
                  <div>
                    <b>
                      Record matched
                    </b>
                    <small>
                      Structured result available
                    </small>
                  </div>
                  <em>
                    Ready
                  </em>
                </div>
              </div>
            </article>
            <article className="workflow-step">
              <div className="workflow-index">
                03
              </div>
              <div className="workflow-icon" aria-hidden="true">
                ◎
              </div>
              <h3>
                Monitor and control
              </h3>
              <p>
                Review operational activity, monitor sessions and apply access controls without leaving the platform.
              </p>
              <div className="workflow-ui">
                <div className="workflow-monitor-row">
                  <div>
                    <span className="workflow-live"></span>
                    <b>
                      Session monitoring
                    </b>
                  </div>
                  <small>
                    Active
                  </small>
                </div>
                <div className="workflow-monitor-row">
                  <div>
                    <span className="workflow-live"></span>
                    <b>
                      Role controls
                    </b>
                  </div>
                  <small>
                    Protected
                  </small>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}

export function CoreWorkflowSection() {
  return (
    <>
      <section id="features">
        <div className="container">
          <div className="section-head feature-showcase-head">
            <div>
              <div className="eyebrow">
                Core workflow
              </div>
              <h2>
                Core functions shown through the interface.
              </h2>
            </div>
            <p>
              SQR keeps each workflow visually consistent. Search, collection management and analysis follow the same restrained design language so users can move between tasks with less friction.
            </p>
          </div>
          <div className="features feature-showcase">
            <article className="feature feature-primary feature-visual">
              <span className="feature-number">
                01 / Search
              </span>
              <div className="ficon" aria-hidden="true">
                ⌕
              </div>
              <h3>
                General Search
              </h3>
              <p>
                Retrieve and review records through a focused search experience designed to keep operational work fast and consistent.
              </p>
              <div className="feature-ui feature-search-ui" aria-hidden="true">
                <div className="mini-search-field">
                  <span>
                    ⌕
                  </span>
                  <span>
                    Search operational records
                  </span>
                  <i>
                    Enter
                  </i>
                </div>
                <div className="mini-record-row">
                  <span></span>
                  <div>
                    <b>
                      Record available
                    </b>
                    <small>
                      Structured result
                    </small>
                  </div>
                  <em>
                    Match
                  </em>
                </div>
                <div className="mini-record-row">
                  <span></span>
                  <div>
                    <b>
                      Related record
                    </b>
                    <small>
                      Additional context
                    </small>
                  </div>
                  <em>
                    Ready
                  </em>
                </div>
              </div>
            </article>
            <article className="feature feature-visual">
              <span className="feature-number">
                02 / Operations
              </span>
              <div className="ficon" aria-hidden="true">
                RM
              </div>
              <h3>
                Collection
              </h3>
              <p>
                Payment records, history, team performance and operational actions are organised in a single view for rapid review.
              </p>
              <div className="feature-ui feature-collection-ui" aria-hidden="true">
                <div className="collection-summary">
                  <div>
                    <span>
                      Records
                    </span>
                    <b>
                      Structured
                    </b>
                  </div>
                  <div>
                    <span>
                      Status
                    </span>
                    <b>
                      Tracked
                    </b>
                  </div>
                </div>
                <div className="collection-line">
                  <span></span>
                  <i style={{"width":"82%"}}></i>
                </div>
                <div className="collection-line">
                  <span></span>
                  <i style={{"width":"64%"}}></i>
                </div>
                <div className="collection-line">
                  <span></span>
                  <i style={{"width":"91%"}}></i>
                </div>
              </div>
            </article>
            <article className="feature feature-visual">
              <span className="feature-number">
                03 / Insight
              </span>
              <div className="ficon" aria-hidden="true">
                ⌁
              </div>
              <h3>
                Analysis
              </h3>
              <p>
                Review quality, structure and operational trends without switching between multiple files or disconnected views.
              </p>
              <div className="feature-ui feature-analysis-ui" aria-hidden="true">
                <div className="analysis-mini-metrics">
                  <div>
                    <span>
                      Quality
                    </span>
                    <b>
                      High
                    </b>
                  </div>
                  <div>
                    <span>
                      Review
                    </span>
                    <b>
                      Focused
                    </b>
                  </div>
                </div>
                <div className="analysis-mini-chart">
                  <i style={{"height":"38%"}}></i>
                  <i style={{"height":"52%"}}></i>
                  <i style={{"height":"45%"}}></i>
                  <i style={{"height":"68%"}}></i>
                  <i style={{"height":"61%"}}></i>
                  <i style={{"height":"82%"}}></i>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}

export function SecuritySection() {
  return (
    <>
      <section id="security">
        <div className="container">
          <div className="security">
            <div className="security-copy">
              <div className="eyebrow">
                Security &amp; control
              </div>
              <h2>
                Security that feels calm, clear and controlled.
              </h2>
              <p>
                SQR presents security controls in a concise, structured flow. Visitors can immediately see how role-based access, 2FA, active sessions and audit trails are managed without overwhelming the interface.
              </p>
              <div className="security-highlights">
                <div className="security-highlight">
                  <div>
                    <b>
                      Role-based access
                    </b>
                    <small>
                      Access is organised by role so that sensitive functions are available only to authorised users.
                    </small>
                  </div>
                </div>
                <div className="security-highlight">
                  <div>
                    <b>
                      Two-factor authentication
                    </b>
                    <small>
                      The 2FA activation flow is presented step by step through clear, easy-to-understand visuals.
                    </small>
                  </div>
                </div>
                <div className="security-highlight">
                  <div>
                    <b>
                      Session &amp; audit visibility
                    </b>
                    <small>
                      Session status and key activity records can be reviewed quickly through a single control centre.
                    </small>
                  </div>
                </div>
              </div>
            </div>
            <div className="security-visual">
              <div className="security-shell">
                <div className="security-topbar">
                  <div>
                    <b>
                      Security Center
                    </b>
                    <span>
                      Access control and account protection overview
                    </span>
                  </div>
                  <span className="security-status">
                    <i aria-hidden="true"></i>
                    Protected
                  </span>
                </div>
                <div className="security-summary">
                  <div className="security-stat">
                    <span>
                      Access
                    </span>
                    <b>
                      4 roles
                    </b>
                    <small>
                      From Superuser to User
                    </small>
                  </div>
                  <div className="security-stat">
                    <span>
                      Authentication
                    </span>
                    <b>
                      2FA
                    </b>
                    <small>
                      6-digit OTP
                    </small>
                  </div>
                  <div className="security-stat">
                    <span>
                      Monitoring
                    </span>
                    <b>
                      Realtime
                    </b>
                    <small>
                      Session &amp; audit log
                    </small>
                  </div>
                </div>
                <div className="security-body">
                  <div className="security-stack">
                    <div className="ui-card">
                      <div className="ui-head">
                        <div>
                          <h3>
                            Role &amp; Permission
                          </h3>
                          <p>
                            Access is presented according to the level of responsibility.
                          </p>
                        </div>
                        <span className="mini-label">
                          <i aria-hidden="true"></i>
                          Controlled
                        </span>
                      </div>
                      <div className="role-list">
                        <div className="role-row">
                          <div className="role-user">
                            <span className="role-avatar" aria-hidden="true">
                              SU
                            </span>
                            <div>
                              <b>
                                Superuser
                              </b>
                              <small>
                                Full access and system configuration.
                              </small>
                            </div>
                          </div>
                          <span className="role-pill">
                            Full
                          </span>
                        </div>
                        <div className="role-row">
                          <div className="role-user">
                            <span className="role-avatar" aria-hidden="true">
                              MG
                            </span>
                            <div>
                              <b>
                                Manager
                              </b>
                              <small>
                                Primary operational access with controlled sensitive permissions.
                              </small>
                            </div>
                          </div>
                          <span className="role-pill">
                            Managed
                          </span>
                        </div>
                        <div className="role-row">
                          <div className="role-user">
                            <span className="role-avatar" aria-hidden="true">
                              AD
                            </span>
                            <div>
                              <b>
                                Admin / User
                              </b>
                              <small>
                                Access to the functions required for day-to-day work.
                              </small>
                            </div>
                          </div>
                          <span className="role-pill">
                            Limited
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="ui-card">
                      <div className="ui-head">
                        <div>
                          <h3>
                            Session Monitor
                          </h3>
                          <p>
                            Key status information without visual clutter.
                          </p>
                        </div>
                        <span className="mini-label">
                          <i aria-hidden="true"></i>
                          Live
                        </span>
                      </div>
                      <div className="session-strip">
                        <div className="session-item">
                          <b>
                            <span className="session-dot" aria-hidden="true"></span>
                            24 active sessions
                          </b>
                          <small>
                            A concise view of active users.
                          </small>
                        </div>
                        <div className="session-item">
                          <b>
                            <span className="session-dot" aria-hidden="true"></span>
                            Idle timeout
                          </b>
                          <small>
                            Inactive sessions are terminated automatically.
                          </small>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="security-stack">
                    <div className="ui-card">
                      <div className="ui-head">
                        <div>
                          <h3>
                            2FA Setup
                          </h3>
                          <p>
                            A concise, guided activation flow.
                          </p>
                        </div>
                        <span className="mini-label">
                          <i aria-hidden="true"></i>
                          Guided
                        </span>
                      </div>
                      <div className="setup-grid">
                        <div className="setup-grid-inner">
                          <div className="qr-sim" aria-hidden="true"></div>
                          <div className="setup-steps">
                            <div className="step">
                              <span className="step-num">
                                1
                              </span>
                              <div>
                                <b>
                                  Scan QR
                                </b>
                                <small>
                                  Link an authenticator application.
                                </small>
                              </div>
                            </div>
                            <div className="step">
                              <span className="step-num">
                                2
                              </span>
                              <div>
                                <b>
                                  Verify OTP
                                </b>
                                <small>
                                  Enter the 6-digit code.
                                </small>
                              </div>
                            </div>
                            <div className="step">
                              <span className="step-num">
                                3
                              </span>
                              <div>
                                <b>
                                  Save recovery option
                                </b>
                                <small>
                                  Configure a recovery option.
                                </small>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="strength-meter">
                          <div className="strength-bars" aria-hidden="true">
                            <span></span>
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                          <div className="strength-meta">
                            <span>
                              Account protection
                            </span>
                            <b>
                              Strong
                            </b>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="ui-card">
                      <div className="ui-head">
                        <div>
                          <h3>
                            Audit Trail
                          </h3>
                          <p>
                            Key actions are arranged chronologically.
                          </p>
                        </div>
                        <span className="mini-label">
                          <i aria-hidden="true"></i>
                          Logged
                        </span>
                      </div>
                      <div className="audit-list">
                        <div className="audit-row">
                          <span className="audit-icon" aria-hidden="true">
                            ✓
                          </span>
                          <div>
                            <b>
                              2FA enabled
                            </b>
                            <small>
                              Authenticator successfully linked.
                            </small>
                          </div>
                          <span className="audit-tag">
                            Success
                          </span>
                        </div>
                        <div className="audit-row">
                          <span className="audit-icon" aria-hidden="true">
                            ↺
                          </span>
                          <div>
                            <b>
                              Session automatically terminated
                            </b>
                            <small>
                              Idle timeout protects against unattended access.
                            </small>
                          </div>
                          <span className="audit-tag">
                            Protected
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="security-list">
                    <div className="security-item">
                      <i aria-hidden="true">
                        ✓
                      </i>
                      <div>
                        <b>
                          Access control
                        </b>
                        <small>
                          Roles and access levels remain easy to distinguish.
                        </small>
                      </div>
                    </div>
                    <div className="security-item">
                      <i aria-hidden="true">
                        ✓
                      </i>
                      <div>
                        <b>
                          Guided authentication
                        </b>
                        <small>
                          2FA is explained clearly without unnecessary complexity.
                        </small>
                      </div>
                    </div>
                    <div className="security-item">
                      <i aria-hidden="true">
                        ✓
                      </i>
                      <div>
                        <b>
                          Continuous visibility
                        </b>
                        <small>
                          Sessions and audit activity can be monitored in one place.
                        </small>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function AboutIntro() {
  return (
    <>
      <div className="about-intro">
        <div>
          <div className="eyebrow">
            About SQR
          </div>
          <h2>
            Built with focus, shaped by operational needs.
          </h2>
        </div>
        <div>
          <p>
            SQR System was established in 2025 as a focused operational platform designed to bring search, analysis, monitoring and access control into one structured environment. The system was conceived, designed, developed and continuously refined by a single developer, Putra, giving it a clear technical direction and a consistent product philosophy from its foundation. Rather than attempting to replicate conventional platforms, SQR has been shaped around its own operational strengths: a lightweight interface, structured workflows, responsive access to information and practical controls that support day-to-day use. Its development continues with the same emphasis on clarity, reliability, performance and purposeful improvement as operational requirements evolve.
          </p>
        </div>
      </div>
    </>
  );
}

export function LandingCTA() {
  return (
    <>
      <div className="cta">
        <div className="cta-kicker">
          SQR Operations Platform
        </div>
        <h2>
          One system. Better organised.
        </h2>
        <p>
          Designed to support daily operations with greater clarity, consistency and speed — without a heavy or cluttered interface.
        </p>
        <div className="cta-actions">
          <LandingLink className="btn btn-primary" href="/login">
            Sign In to SQR
          </LandingLink>
          <LandingLink className="btn btn-ghost" href="#product-preview">
            View the Platform
          </LandingLink>
        </div>
      </div>
    </>
  );
}

export function LandingFooter() {
  return (
    <>
      <footer>
        <div className="container footer-inner">
          <div>
            <div className="footer-brand">
              <span className="brand-mark">
                SQR
              </span>
              <span>
                Sumbangan Query Rahmah
              </span>
            </div>
            <div className="footer-copy">
              An internal operations platform focused on search, analysis, monitoring and access control within a consistent interface.
            </div>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <LandingLink href="#product-preview">
              Product
            </LandingLink>
            <LandingLink href="#features">
              Features
            </LandingLink>
            <LandingLink href="#security">
              Security
            </LandingLink>
            <LandingLink href="#main-content">
              Back to top
            </LandingLink>
          </nav>
        </div>
      </footer>
    </>
  );
}
