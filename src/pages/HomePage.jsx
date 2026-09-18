import { useMemo, useState } from "react";
import AppShell from "../components/shell/AppShell";
import WelcomeHero from "../components/home/WelcomeHero";
import RecentApis from "../components/home/RecentApis";
import WorkspacePanel from "../components/home/WorkspacePanel";
import ApiMapCta from "../components/home/ApiMapCta";
import SampleCards from "../components/home/SampleCards";
import { useAuth } from "../components/auth/useAuth";
import { getRecents, removeRecent } from "../utils/recents";
import { listWorkspaces } from "../utils/contractWorkspace";

/**
 * Home shows what is the user's own — the APIs they imported and the
 * estates they mapped — plus the ways to start something new. The tools
 * that work on a loaded API (playground, audit, mock server, docs…) live
 * inside the API Map, where they can actually run.
 */
const HomePage = () => {
  const { user } = useAuth();
  // Both lists are read from storage; the account decides which bucket.
  const [recents, setRecents] = useState(() => getRecents());
  const workspaces = useMemo(() => listWorkspaces(user?.id || null), [user]);
  const [query, setQuery] = useState("");

  const firstName = (user?.name || "").split(" ")[0];

  return (
    <AppShell query={query} onQueryChange={setQuery}>
      <WelcomeHero firstName={firstName} />

      <div className="hm-grid">
        <div className="hm-col">
          <RecentApis recents={recents} query={query} onRemove={(id) => setRecents(removeRecent(id))} />
        </div>
        <div className="hm-col">
          <WorkspacePanel workspaces={workspaces} query={query} signedIn={Boolean(user)} />
          <ApiMapCta />
          <SampleCards />
        </div>
      </div>
    </AppShell>
  );
};

export default HomePage;
