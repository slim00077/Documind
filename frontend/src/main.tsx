import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import { installWorkspaceFetch } from "./config/workspace";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/intelligence.css";
import "./styles/design.css";
import "./styles/glass.css";
import "./styles/org.css";
import { installSpotlight } from "./components/ui/InteractiveSpotlight";

installSpotlight();
installWorkspaceFetch();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <WorkspaceProvider>
            <App />
          </WorkspaceProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
