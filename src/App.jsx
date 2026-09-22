import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import LandingPage from "./pages/LandingPage";
import BlogIndexPage from "./pages/BlogIndexPage";
import BlogPostPage from "./pages/BlogPostPage";
import { AuthProvider } from "./components/auth/AuthContext";
import AccountGate from "./components/auth/AccountGate";
import { useAuth } from "./components/auth/useAuth";

// The landing page is the entry route, so it ships in the main chunk.
// The workspace is loaded on demand.
const PostmanGraphViewer = lazy(() => import("./PostmanGraphViewer"));
// The embed renders a static vector, so it never pulls in the workspace.
const EmbedMap = lazy(() => import("./pages/EmbedMap"));
const EmbedGraph = lazy(() => import("./pages/EmbedGraph"));
// The multi-service map and the account pages are separate entry points.
const ContractGraphPage = lazy(() => import("./pages/ContractGraphPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
import { SOAP_WORKBENCH } from "./features";

// Off for now (src/features.js): the import is skipped, so its chunk is not built either.
const SoapWorkbenchPage = SOAP_WORKBENCH ? lazy(() => import("./pages/SoapWorkbenchPage")) : null;

const Loader = () => (
  <div className="flex h-screen w-full items-center justify-center bg-vz-bg">
    <div className="text-center">
      <div className="mb-3 text-2xl font-extrabold tracking-tight text-vz-accent-2">
        Vizroute
      </div>
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-vz-accent/30 border-t-vz-accent" />
    </div>
  </div>
);

// The marketing page is for visitors. Someone with a session who opens the
// root is in the product, so they go to Home; /landing shows the page anyway.
const RootGate = () => {
  const { user } = useAuth();
  return user ? <Navigate to="/home" replace /> : <LandingPage />;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/" element={<RootGate />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/blog" element={<BlogIndexPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/workspace" element={<PostmanGraphViewer />} />
          <Route path="/home" element={<HomePage />} />
          {/* Contract Graph keeps an estate, so it needs somewhere to keep it: an account. */}
          <Route
            path="/graph"
            element={(
              <AccountGate
                feature="Contract Graph"
                reason="Contract Graph maps every API you have against each other and keeps that estate for next time. An account is what it belongs to."
                points={[
                  "Workspaces that are yours, kept between visits and browsers",
                  "Shared entities, duplicate endpoints and dependencies across services",
                  "Import and export a whole estate, and share a map with your team",
                ]}
              >
                <ContractGraphPage />
              </AccountGate>
            )}
          />
          {/* Off for now (src/features.js); the route answers again with VITE_SOAP_WORKBENCH=on. */}
          <Route path="/soap" element={SOAP_WORKBENCH ? <SoapWorkbenchPage /> : <Navigate to="/home" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/embed" element={<EmbedMap />} />
          <Route path="/embed-graph" element={<EmbedGraph />} />
          {/* Kept so older links and bookmarks keep working */}
          <Route path="/app" element={<PostmanGraphViewer />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
