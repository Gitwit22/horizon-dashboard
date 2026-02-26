import { createRoot } from "react-dom/client";
import { ChatProvider } from "./context/ChatContext";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
