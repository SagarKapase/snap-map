import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const PostmanGraphViewer = lazy(() => import("./PostmanGraphViewer"));

const Loader = () => (
  <div className="w-full h-screen bg-[#0c0e12] flex items-center justify-center">
    <div className="text-center">
      <div className="text-2xl font-black text-[#e08efe] mb-3 tracking-tight">Vizroute</div>
      <div className="w-8 h-8 border-2 border-[#e08efe]/30 border-t-[#e08efe] rounded-full animate-spin mx-auto" />
    </div>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/app" element={<PostmanGraphViewer />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
