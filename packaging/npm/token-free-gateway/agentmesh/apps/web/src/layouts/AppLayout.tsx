import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { RightPanel } from "../components/RightPanel";
import { sectionByPath } from "../routes/section-config";

// Common shell for every section: sidebar + top bar + right panel.
// The page content is rendered through the router <Outlet />.

export function AppLayout() {
  const { pathname } = useLocation();
  const section = sectionByPath(pathname);

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="main-wrapper">
        <header className="top-bar">
          <div className="top-bar-left">
            <h1 className="page-title">{section.label}</h1>
          </div>
          <div className="top-bar-right">
            <div className="global-search">
              <input
                type="text"
                placeholder="Ask the Network..."
                className="search-input"
              />
              <button className="search-button">Search</button>
            </div>
            <div className="user-menu">
              <span className="user-credits">12,480 Credits</span>
            </div>
          </div>
        </header>

        <div className="content-layout">
          <main className="main-content" role="main">
            <Outlet />
          </main>

          <RightPanel />
        </div>
      </div>
    </div>
  );
}
