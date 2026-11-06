/** Verified official destinations. These are links, never inferred live statuses. */
export interface TransportLink {
  id: string;
  label: string;
  description: string;
  url: string;
  mode: "train" | "tram" | "bus" | "journey";
}

export const transportLinks: TransportLink[] = [
  {
    id: "departures",
    label: "Next departures",
    description: "Find your stop and check live departures",
    url: "https://transport.vic.gov.au/departures",
    mode: "train",
  },
  {
    id: "journey",
    label: "Plan a journey",
    description: "Train, tram and bus connections and travel times",
    url: "https://transport.vic.gov.au/journey",
    mode: "journey",
  },
  {
    id: "network",
    label: "Network status",
    description: "Check current public transport service status",
    url: "https://networkstatus.ptv.vic.gov.au/",
    mode: "train",
  },
  {
    id: "disruptions",
    label: "Works & disruptions",
    description: "Planned works, disruptions and replacement buses",
    url: "https://transport.vic.gov.au/disruptions/disruptions-information",
    mode: "bus",
  },
  {
    id: "trams",
    label: "Tram service changes",
    description: "Route and stop changes from Yarra Trams",
    url: "https://yarratrams.com.au/service-changes",
    mode: "tram",
  },
];

export interface AirLink {
  id: string;
  label: string;
  description: string;
  url: string;
}

export const airLinks: AirLink[] = [
  {
    id: "airwatch",
    label: "EPA station readings",
    description:
      "Check nearby stations, hourly air quality and monitoring status",
    url: "https://www.epa.vic.gov.au/check-air-and-water-quality",
  },
  {
    id: "categories",
    label: "Understanding EPA ratings",
    description:
      "Official air quality categories and advice for outdoor activities",
    url: "https://www.epa.vic.gov.au/air-quality-categories",
  },
];

export const roadTrafficLink = {
  label: "VicTraffic",
  description: "Road closures, incidents and roadworks",
  url: "https://traffic.transport.vic.gov.au/",
};

export const officialDataAvailability = {
  transport:
    "This page links to official transport services. Check Transport Victoria for live departures and service status.",
  air: "EPA station readings are available on the official website. Regional model estimates may differ from observations; check EPA AirWatch for local conditions.",
} as const;
