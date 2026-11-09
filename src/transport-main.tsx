import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import TransportApp from "./TransportApp";

import "./styles/navy-theme.css";
import "./styles/navy-pages.css";
import "./styles/ptv-transport.css";
import "./styles/transit-modes.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><TransportApp /></React.StrictMode>,
);
