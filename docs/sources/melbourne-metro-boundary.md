# Metropolitan Melbourne search boundary

`src/data/melbourneMetroBoundary.json` is a small GeoJSON snapshot of the 31 metropolitan Melbourne local government areas. It supports local destination filtering; it is not a legal boundary determination or a guarantee of transport coverage.

## Scope

The [Victorian Government's metropolitan Melbourne guide](https://liveinmelbourne.vic.gov.au/discover/melbourne/metropolitan-melbourne) describes Greater Melbourne as these 31 council areas. This project uses that council-based scope. It does not claim to implement the ABS Greater Capital City Statistical Area or the metropolitan planning boundary, which also includes part of Mitchell Shire.

The selected current Vicmap names are Banyule, Bayside, Boroondara, Brimbank, Cardinia, Casey, Darebin, Frankston, Glen Eira, Greater Dandenong, Hobsons Bay, Hume, Kingston, Knox, Manningham, Maribyrnong, Maroondah, Melbourne, Melton, Merri-bek, Monash, Moonee Valley, Mornington Peninsula, Nillumbik, Port Phillip, Stonnington, Whitehorse, Whittlesea, Wyndham, Yarra and Yarra Ranges. Merri-bek is the current name of the former Moreland municipality.

## Source and licence

- Provider: State of Victoria, Department of Transport and Planning.
- Dataset: [Vicmap Admin](https://www.arcgis.com/home/item.html?id=51eed453d31243a795850b765a400769).
- Layer: [Local Government Area Boundaries (aligned to Property), `LGA_POLYGON`, layer 9](https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/arcgis/rest/services/Vicmap_Admin/FeatureServer/9).
- Retrieved and validated: 9 November 2026.
- Licence: Creative Commons Attribution 4.0 International, as declared by the official item metadata. Attribution: **State of Victoria (Department of Transport and Planning), Vicmap Admin**.

[Vicmap as a Service](https://www.land.vic.gov.au/maps-and-spatial/data-services/vicmap-as-a-service) makes these public services available to web mapping applications and other API users. No account or credential was used to obtain this snapshot.

## Reproduction and precision

Request the layer's `/query` operation with:

| Parameter | Value |
| --- | --- |
| `f` | `geojson` |
| `where` | `lga_name IN (...)`, using the 31 uppercase current names above |
| `outFields` | `lga_code,lga_name` |
| `returnGeometry` | `true` |
| `outSR` | `4326` |
| `maxAllowableOffset` | `0.0005` |
| `geometryPrecision` | `5` |
| `resultRecordCount` | `100` |
| `orderByFields` | `lga_name` |

The service simplifies geometry in the output coordinate system. The 0.0005-degree tolerance is approximately 44–56 metres around Melbourne; five decimal places add roughly metre-scale rounding. Near-boundary results may therefore differ from the unsimplified official data. Use this snapshot for regional search scope, not property, planning or jurisdictional decisions.

Coordinates remain longitude/latitude in WGS84. GeoJSON polygon/ring nesting is retained exactly as returned by the service; no convex hull, bounding-box replacement or manual coordinate editing is used. This response contains 31 Polygon features, 31 closed rings and 5,728 coordinate positions. A future refresh must retain any returned interior rings and MultiPolygon parts rather than flattening them.

The snapshot is 129,117 bytes before compression and approximately 35 KB with gzip. Its bounding extent is longitude 144.44408–146.19253, latitude −38.49992–−37.40174. A preliminary rectangle check may accelerate lookup, but it must not replace the polygon test; parts of this rectangle lie outside the selected councils.

Refresh from the same official layer when municipal boundaries change. Before replacing the file, confirm all 31 unique council names are present, no response error or transfer-limit truncation occurred, every ring is closed, and each coordinate is a finite WGS84 pair. Preserve the source, licence and retrieval date in the metadata.
