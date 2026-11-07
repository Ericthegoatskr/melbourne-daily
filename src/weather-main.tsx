import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import WeatherApp from "./WeatherApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><WeatherApp /></React.StrictMode>,
);
