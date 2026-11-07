import { handleRequest } from "./index";
import type { TransitEnv } from "./transit";

export type PublicTransitEnvironment = TransitEnv & { ALLOWED_ORIGINS?: string };

/** Dedicated public read endpoint; the existing EPA service stays private. */
export async function handlePublicTransitRequest(
  request: Request,
  env: PublicTransitEnvironment,
): Promise<Response> {
  if (new URL(request.url).pathname !== "/api/transit/departures") {
    return new Response(
      JSON.stringify({ error: { code: "not_found", message: "Resource not found." } }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
  // Copy only this provider's runtime configuration, even if another secret was
  // accidentally added to the host. No private Site service token is needed.
  return handleRequest(request, {
    PTV_DEV_ID: env.PTV_DEV_ID,
    PTV_API_KEY: env.PTV_API_KEY,
    ALLOWED_ORIGINS: env.ALLOWED_ORIGINS,
  });
}

export default { fetch: handlePublicTransitRequest };
