import React from "react";
import ReactDOM from "react-dom/client";

import { AppProviders } from "./app/AppProviders";
import { AgentTeamsApp } from "./app/AgentTeamsApp";
import { markBootstrapReady } from "./app/bootstrapState";
import "./styles/theme.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Missing application root element.");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppProviders>
      <AgentTeamsApp />
    </AppProviders>
  </React.StrictMode>,
);

markBootstrapReady();
