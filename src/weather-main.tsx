import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import WeatherApp from "./WeatherApp";

import "./styles/navy-theme.css";
import "./styles/navy-pages.css";
import "./styles/sunset-frame.css";
import "./styles/sunset-weather.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><WeatherApp /></React.StrictMode>,
);
