import { useId } from "react";
import "./TransportScene.css";

/** Decorative tram illustration; it does not represent a route or live vehicle. */
export default function TransportScene() {
  const id = useId().replace(/:/g, "");

  return (
    <svg className="transport-scene" viewBox="0 0 360 230" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#f4a378" />
          <stop offset="1" stopColor="#d97850" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f6f7f9" />
          <stop offset="1" stopColor="#c7d3db" />
        </linearGradient>
        <radialGradient id={`${id}-halo`}>
          <stop stopColor="#f0dcd0" stopOpacity=".6" />
          <stop offset="1" stopColor="#f6e7dc" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="196" cy="110" rx="158" ry="108" fill={`url(#${id}-halo)`} />
      <g className="transport-scene__city">
        <rect x="239" y="63" width="41" height="128" rx="8" fill="#e4dce9" />
        <rect x="287" y="97" width="36" height="94" rx="7" fill="#e9dfd4" />
        <rect x="55" y="109" width="35" height="82" rx="7" fill="#dce6df" />
        <path d="M250 78h6m8 0h6m-20 15h6m8 0h6m-20 15h6m8 0h6m-20 15h6m8 0h6m-20 15h6m8 0h6M297 113h15m-15 16h15m-15 16h15M65 124h14m-14 15h14m-14 15h14" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity=".75" />
        <path d="M32 190h298" stroke="#d8d0cc" strokeWidth="2" strokeLinecap="round" />
        <path d="M40 199h282" stroke="#e6ded7" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className="transport-scene__cloud" fill="none" strokeLinecap="round">
        <path d="M63 57h35m-24 9h43" stroke="#d5c4de" strokeWidth="3" />
        <path d="M298 49h22m-30 9h13" stroke="#dbc9b8" strokeWidth="2.5" />
        <circle cx="125" cy="36" r="3" fill="#d7bfaa" stroke="none" />
      </g>
      <ellipse cx="177" cy="196" rx="86" ry="10" fill="#766e77" opacity=".1" />
      <g className="transport-scene__tram">
        <path d="M165 64l14-18 17 18" fill="none" stroke="#8f879b" strokeWidth="3" strokeLinejoin="round" />
        <path d="M159 45h42" stroke="#b4a6c0" strokeWidth="3" strokeLinecap="round" />
        <rect x="99" y="63" width="137" height="121" rx="22" fill={`url(#${id}-body)`} stroke="#cb805d" strokeWidth="1.2" />
        <path d="M211 64h11c15 0 26 12 26 27v70c0 13-11 23-24 23h-13z" fill="#c96c49" />
        <rect x="109" y="79" width="117" height="58" rx="9" fill="#b9785f" />
        <rect x="114" y="83" width="106" height="48" rx="6" fill={`url(#${id}-glass)`} />
        <path d="M167 84v47" stroke="#aa9da1" strokeWidth="3" />
        <path d="M119 91h36m24 0h29" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".75" />
        <path d="M119 129l19-17m69 17-19-17" stroke="#8c91a3" strokeWidth="2" strokeLinecap="round" />
        <rect x="138" y="68" width="59" height="7" rx="3.5" fill="#f9d6bc" />
        <path d="M103 143h128v18H103z" fill="#fbf2e6" />
        <path d="M231 143h14v18h-14z" fill="#edcfb9" />
        <circle cx="118" cy="152" r="5" fill="#fff9dd" stroke="#e3be84" />
        <circle cx="216" cy="152" r="5" fill="#fff9dd" stroke="#e3be84" />
        <path d="M145 171h43" stroke="#ae5a40" strokeWidth="4" strokeLinecap="round" />
        <rect x="115" y="180" width="19" height="12" rx="5" fill="#6e697a" />
        <rect x="204" y="180" width="19" height="12" rx="5" fill="#6e697a" />
        <path d="M104 177h126" stroke="#e4a07a" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="transport-scene__plant">
        <path d="M51 190v-31" stroke="#90a592" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M51 174c-15 0-18-16-10-19 10-4 13 12 10 19" fill="#b3c5b6" />
        <path d="M51 167c0-15 12-21 17-14 6 9-6 15-17 14" fill="#c8d7c6" />
      </g>
    </svg>
  );
}
