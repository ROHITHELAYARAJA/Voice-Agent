import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/auth",
        "/preview",
        "/mfa",
        "/dashboard",
        "/journals",
        "/moods",
        "/insights",
        "/self-care",
        "/challenge",
        "/recap",
        "/calls",
        "/schedule",
        "/settings",
        "/onboarding",
        "/admin",
      ],
    },
  };
}
