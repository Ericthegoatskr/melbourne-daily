import { useId } from "react";
import "./WeatherScene.css";

/** Decorative counterpart to the adjacent, readable weather description. */
export default function WeatherScene({
  code,
  isDay,
}: {
  code: number;
  isDay: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const storm = code >= 95;
  const snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const rain = code >= 51 && !snow && !storm;
  const fog = code === 45 || code === 48;
  const clear = code === 0;
  const partly = code === 1 || code === 2;
  const celestial = clear || partly;
  const cx = clear ? 96 : 124;
  const cy = clear ? 66 : 47;

  return (
    <svg
      className={`weather-scene ${isDay ? "weather-scene--day" : "weather-scene--night"}`}
      viewBox="0 0 192 160"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-halo`}>
          <stop stopColor={isDay ? "#ffe4c7" : "#e1dcff"} stopOpacity=".9" />
          <stop offset="1" stopColor={isDay ? "#fff5e8" : "#f2efff"} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffd678" />
          <stop offset=".55" stopColor="#ffb448" />
          <stop offset="1" stopColor="#f78b40" />
        </linearGradient>
        <linearGradient id={`${id}-moon`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#d0c7ff" />
          <stop offset="1" stopColor="#8b7de0" />
        </linearGradient>
        <linearGradient id={`${id}-cloud`} x1="0" y1="0" x2=".5" y2="1">
          <stop stopColor={storm ? "#dcd9ec" : "#ffffff"} />
          <stop offset="1" stopColor={storm ? "#a4a0c5" : "#e4e2f2"} />
        </linearGradient>
        <radialGradient id={`${id}-ground`}>
          <stop stopColor="#78708e" stopOpacity=".15" />
          <stop offset="1" stopColor="#78708e" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="98" cy="72" r="74" fill={`url(#${id}-halo)`} />
      <circle cx="98" cy="72" r="61" fill="none" stroke={isDay ? "#f0daca" : "#ddd7f0"} strokeDasharray="2 8" strokeWidth="1" opacity=".65" />
      <ellipse cx="96" cy="139" rx="61" ry="13" fill={`url(#${id}-ground)`} />

      {celestial && (
        <g className="weather-scene__celestial">
          {isDay ? (
            <>
              {Array.from({ length: 8 }, (_, index) => (
                <path
                  key={index}
                  d={`M ${cx} ${cy - 41} v -6`}
                  transform={`rotate(${index * 45} ${cx} ${cy})`}
                  fill="none"
                  stroke="#edaa5c"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              ))}
              <circle cx={cx} cy={cy} r="32" fill={`url(#${id}-sun)`} />
              <path d={`M ${cx - 22} ${cy - 3} a 24 24 0 0 1 20 -20`} fill="none" stroke="#fff5ca" strokeWidth="3" strokeLinecap="round" opacity=".8" />
            </>
          ) : (
            <>
              <path
                d={`M ${cx + 13} ${cy - 30} a 33 33 0 1 0 20 51 a 29 29 0 0 1 -20 -51 Z`}
                fill={`url(#${id}-moon)`}
              />
              <path d={`M ${cx + 31} ${cy - 29} v 9 m -4.5 -4.5 h 9 M ${cx - 34} ${cy + 24} v 7 m -3.5 -3.5 h 7`} stroke="#aaa0d8" strokeWidth="1.8" strokeLinecap="round" />
            </>
          )}
        </g>
      )}

      {!clear && (
        <g className="weather-scene__cloud">
          <path d="M 49 106 C 33 106 26 95 30 82 C 33 72 41 67 52 68 C 56 45 83 37 101 54 C 116 49 132 58 134 73 C 153 70 166 82 162 95 C 160 103 152 107 141 107 Z" fill="#b7b2d0" opacity=".16" transform="translate(0 4)" />
          <path d="M 49 102 C 33 102 26 91 30 78 C 33 68 41 63 52 64 C 56 41 83 33 101 50 C 116 45 132 54 134 69 C 153 66 166 78 162 91 C 160 99 152 103 141 103 Z" fill={`url(#${id}-cloud)`} stroke={storm ? "#bbb5d7" : "#dcd9eb"} strokeWidth="1" />
          <path d="M 43 76 C 48 71 54 72 60 74 C 62 54 78 47 90 55" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".7" />
        </g>
      )}

      {rain && (
        <g className="weather-scene__precipitation" fill="none" stroke="#9b8dd1" strokeWidth="3.5" strokeLinecap="round">
          <path d="M 66 115 l -5 10 M 94 118 l -6 12 M 123 114 l -5 10" />
        </g>
      )}
      {snow && (
        <g className="weather-scene__precipitation" fill="none" stroke="#9f96bf" strokeWidth="1.8" strokeLinecap="round">
          {[63, 96, 129].map((x) => (
            <path key={x} d={`M ${x} 114 v 14 m -6 -10.5 l 12 7 m -12 0 l 12 -7`} />
          ))}
        </g>
      )}
      {storm && (
        <path className="weather-scene__precipitation" d="M 95 101 H 111 L 99 119 H 110 L 85 144 L 91 123 H 80 Z" fill={`url(#${id}-sun)`} stroke="#ed9b4e" strokeWidth="1" strokeLinejoin="round" />
      )}
      {fog && (
        <g className="weather-scene__precipitation" fill="none" stroke="#b2a9c9" strokeWidth="3" strokeLinecap="round">
          <path d="M 45 115 H 125 M 65 125 H 147 M 42 135 H 111" />
        </g>
      )}
    </svg>
  );
}
