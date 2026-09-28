import { RelativeDate } from "./RelativeDate";

// Illustrative values from the supplied design; this preview never requests API data.
export function OverviewPreview() {
  return (
    <>
      <div className="main-head">
        <div>
          <p className="demo-heading">
            Dashboard
          </p>
          <p>
            Current operational overview
          </p>
        </div>
        <div className="status">
          <span className="dot" aria-hidden="true"></span>
           System Normal
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <span>
            Total Records
          </span>
          <strong>
            128,640
          </strong>
          <small className="green">
            Data available for search
          </small>
        </div>
        <div className="kpi">
          <span>
            Today's Searches
          </span>
          <strong>
            3,492
          </strong>
          <small>
            General Search active
          </small>
        </div>
        <div className="kpi">
          <span>
            Imported Files
          </span>
          <strong>
            86
          </strong>
          <small className="green">
            Data sources available
          </small>
        </div>
        <div className="kpi user-kpi">
          <span>
            Active Users
          </span>
          <strong className="count-up is-live" data-target="38" data-start="24">
            38
          </strong>
          <small className="green">
            Real-time status
          </small>
        </div>
      </div>
      <div className="grid2">
        <div className="panel">
          <div className="panel-title">
            <b>
              System Activity Trend
            </b>
            <span>
              30 days
            </span>
          </div>
          <div className="chart">
            <div className="line"></div>
            <span className="chart-node n1"></span>
            <span className="chart-node n2"></span>
            <span className="chart-node n3"></span>
            <span className="chart-node n4"></span>
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">
            <b>
              Module Status
            </b>
            <span>
              Live
            </span>
          </div>
          <div className="mini-list">
            <div className="mini-row">
              <div className="mini-left">
                <div className="avatar"></div>
                <div>
                  <b>
                    General Search
                  </b>
                  <small>
                    Search available
                  </small>
                </div>
              </div>
              <span className="badge">
                Online
              </span>
            </div>
            <div className="mini-row">
              <div className="mini-left">
                <div className="avatar"></div>
                <div>
                  <b>
                    Viewer
                  </b>
                  <small>
                    Data view available
                  </small>
                </div>
              </div>
              <span className="badge">
                Online
              </span>
            </div>
            <div className="mini-row">
              <div className="mini-left">
                <div className="avatar"></div>
                <div>
                  <b>
                    Analysis
                  </b>
                  <small>
                    Analysis available
                  </small>
                </div>
              </div>
              <span className="badge">
                Online
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="table">
        <div className="tr">
          <div>
            Record
          </div>
          <div>
            Source
          </div>
          <div>
            Updated
          </div>
          <div>
            Type
          </div>
          <div>
            Status
          </div>
        </div>
        <div className="tr">
          <div>
            REC-10482
          </div>
          <div>
            Dataset A
          </div>
          <RelativeDate daysAgo={1} />
          <div>
            Customer Data
          </div>
          <div className="green">
            Ready
          </div>
        </div>
        <div className="tr">
          <div>
            REC-10479
          </div>
          <div>
            Dataset B
          </div>
          <RelativeDate daysAgo={1} />
          <div>
            Reference
          </div>
          <div className="gold">
            Review
          </div>
        </div>
        <div className="tr">
          <div>
            REC-10461
          </div>
          <div>
            Dataset C
          </div>
          <RelativeDate daysAgo={2} />
          <div>
            Analysis
          </div>
          <div className="green">
            Ready
          </div>
        </div>
      </div>
    </>
  );
}

export function SearchPreview() {
  return (
    <>
      <div className="preview-toolbar">
        <div>
          <p className="demo-heading">
            General Search
          </p>
          <p>
            Fast search across available data sources.
          </p>
        </div>
        <div className="status">
          <span className="dot" aria-hidden="true"></span>
           Ready
        </div>
      </div>
      <div className="search-demo">
        <div className="searchbox" aria-hidden="true">
          <span>
            ⌕
          </span>
          <span>
            Search across available records...
          </span>
          <span className="search-live">
            <i></i>
             Live
          </span>
          <kbd>
            Enter
          </kbd>
        </div>
        <div className="result-grid">
          <div className="result-card">
            <span>
              Matches
            </span>
            <strong className="metric" data-start="12" data-target="24">
              24
            </strong>
            <small>
              Found across active sources
            </small>
          </div>
          <div className="result-card">
            <span>
              Response Time
            </span>
            <strong>
              &lt; 1 second
            </strong>
            <small>
              Optimised for operational review
            </small>
          </div>
          <div className="result-card">
            <span>
              Source
            </span>
            <strong className="metric" data-start="3" data-target="6">
              6
            </strong>
            <small>
              Presented in an organised manner
            </small>
          </div>
        </div>
        <div className="search-spark">
          <div className="spark-panel">
            <div className="spark-title">
              <b>
                Search Flow
              </b>
              <span>
                Real-time
              </span>
            </div>
            <div className="search-chart">
              <div className="search-line"></div>
            </div>
          </div>
          <div className="query-panel">
            <div className="spark-title">
              <b>
                Activity
              </b>
              <span>
                Summary
              </span>
            </div>
            <div className="search-bars">
              <i className="search-bar"></i>
              <i className="search-bar"></i>
              <i className="search-bar"></i>
              <i className="search-bar"></i>
            </div>
            <div className="query-metrics">
              <div className="query-pill">
                <span>
                  Active Queries
                </span>
                <b className="metric" data-start="5" data-target="18">
                  18
                </b>
              </div>
              <div className="query-pill">
                <span>
                  Exact Matches
                </span>
                <b>
                  96%
                </b>
              </div>
            </div>
          </div>
        </div>
        <div className="match-list">
          <div className="match-row">
            <div>
              Record
            </div>
            <div>
              Source
            </div>
            <div>
              Type
            </div>
            <div>
              Status
            </div>
          </div>
          <div className="match-row">
            <div>
              REC-20891
            </div>
            <div>
              Dataset A
            </div>
            <div>
              Customer
            </div>
            <div className="match-state">
              Match
            </div>
          </div>
          <div className="match-row">
            <div>
              REC-20875
            </div>
            <div>
              Dataset C
            </div>
            <div>
              Reference
            </div>
            <div className="match-state">
              Match
            </div>
          </div>
          <div className="match-row">
            <div>
              REC-20862
            </div>
            <div>
              Dataset B
            </div>
            <div>
              History
            </div>
            <div className="match-state">
              Match
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function AnalysisPreview() {
  return (
    <>
      <div className="preview-toolbar">
        <div>
          <p className="demo-heading">
            Analysis
          </p>
          <p>
            Data quality and structure at a glance.
          </p>
        </div>
        <div className="status">
          <span className="dot" aria-hidden="true"></span>
           Ready
        </div>
      </div>
      <div className="analysis-grid">
        <div className="analysis-card">
          <span>
            Records Analysed
          </span>
          <strong className="metric" data-start="104220" data-target="128640">
            128,640
          </strong>
          <small>
            From available sources
          </small>
        </div>
        <div className="analysis-card">
          <span>
            Valid
          </span>
          <strong className="metric" data-start="84.3" data-target="92.4" data-decimals="1" data-suffix="%">
            92.4%
          </strong>
          <small className="green">
            High data quality
          </small>
        </div>
        <div className="analysis-card">
          <span>
            Requires Review
          </span>
          <strong className="metric" data-start="11.8" data-target="7.6" data-decimals="1" data-suffix="%">
            7.6%
          </strong>
          <small>
            Organised for further action
          </small>
        </div>
      </div>
      <div className="analysis-visual">
        <div className="analysis-trend">
          <div className="trend-head">
            <b>
              Quality Trend
            </b>
            <span>
              6 snapshots
            </span>
          </div>
          <div className="analysis-chart">
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
          </div>
        </div>
        <div className="analysis-breakdown">
          <div className="trend-head">
            <b>
              Review Score
            </b>
            <span>
              Per metric
            </span>
          </div>
          <div className="breakdown-list">
            <div className="breakdown-row">
              <span>
                Format
              </span>
              <div className="breakdown-meter">
                <i></i>
              </div>
              <b>
                94%
              </b>
            </div>
            <div className="breakdown-row">
              <span>
                Completeness
              </span>
              <div className="breakdown-meter">
                <i></i>
              </div>
              <b>
                91%
              </b>
            </div>
            <div className="breakdown-row">
              <span>
                Duplicates
              </span>
              <div className="breakdown-meter">
                <i></i>
              </div>
              <b>
                97%
              </b>
            </div>
          </div>
        </div>
      </div>
      <div className="quality-panel">
        <div className="quality-box">
          <b>
            Data Quality
          </b>
          <div className="quality-bar">
            <i></i>
          </div>
          <div className="quality-list">
            <div className="quality-row">
              <span>
                Consistent format
              </span>
              <b>
                94%
              </b>
            </div>
            <div className="quality-row">
              <span>
                Complete records
              </span>
              <b>
                91%
              </b>
            </div>
            <div className="quality-row">
              <span>
                Low duplication
              </span>
              <b>
                97%
              </b>
            </div>
          </div>
        </div>
        <div className="quality-box">
          <b>
            Summary
          </b>
          <div className="quality-list">
            <div className="quality-row">
              <span>
                Active datasets
              </span>
              <b className="metric" data-start="3" data-target="6">
                6
              </b>
            </div>
            <div className="quality-row">
              <span>
                Columns analysed
              </span>
              <b className="metric" data-start="18" data-target="42">
                42
              </b>
            </div>
            <div className="quality-row">
              <span>
                Status
              </span>
              <b className="green">
                Ready
              </b>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function PreviewSidebar() {
  return (
    <>
      <aside className="sidebar">
        <div className="side-brand">
          <span className="brand-mark">
            SQR
          </span>
          <div>
            <strong>
              SQR
            </strong>
            <small>
              Operations Console
            </small>
          </div>
        </div>
        <div className="navlabel">
          Workspace
        </div>
        <div className="sideitem active">
          <span className="sideico" aria-hidden="true">
            ⌂
          </span>
          <span>
            Dashboard
          </span>
        </div>
        <div className="sideitem">
          <span className="sideico" aria-hidden="true">
            ⌕
          </span>
          <span>
            General Search
          </span>
        </div>
        <div className="sideitem">
          <span className="sideico" aria-hidden="true">
            ⇧
          </span>
          <span>
            Import
          </span>
        </div>
        <div className="sideitem">
          <span className="sideico" aria-hidden="true">
            ▦
          </span>
          <span>
            Viewer
          </span>
        </div>
        <div className="sideitem">
          <span className="sideico" aria-hidden="true">
            ◫
          </span>
          <span>
            Analysis
          </span>
        </div>
        <div className="navlabel">
          Operations
        </div>
        <div className="sideitem">
          <span className="sideico" aria-hidden="true">
            ◎
          </span>
          <span>
            Activity
          </span>
        </div>
        <div className="sideitem">
          <span className="sideico" aria-hidden="true">
            ⚙
          </span>
          <span>
            Settings
          </span>
        </div>
      </aside>
    </>
  );
}
