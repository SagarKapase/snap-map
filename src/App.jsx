import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import LandingPage from "./pages/LandingPage";

// The landing page is the entry route, so it ships in the main chunk.
// The workspace is loaded on demand.
const PostmanGraphViewer = lazy(() => import("./PostmanGraphViewer"));

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

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/workspace" element={<PostmanGraphViewer />} />
          {/* Kept so older links and bookmarks keep working */}
          <Route path="/app" element={<PostmanGraphViewer />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
