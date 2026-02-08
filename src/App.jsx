import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import PostmanGraphViewer from "./PostmanGraphViewer";

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <PostmanGraphViewer />
    </>
  );
}

export default App;
