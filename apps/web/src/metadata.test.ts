import { describe, expect, it } from "vitest";
import { canonicalUrlForPath, metadataForPath } from "./metadata";
import { siteAssetUrl } from "./site-config";

describe("page metadata", () => {
  it("keeps the home page truthful and Reel-first", () => {
    const metadata = metadataForPath("/");
    expect(metadata.title).toBe("Instagram Reel & YouTube Downloader – InstaFetch");
    expect(metadata.description).toContain(
      "publicly accessible Instagram Reels",
    );
    expect(metadata.description).not.toContain("guaranteed");
  });

  it("creates stable canonical URLs for legal routes", () => {
    expect(canonicalUrlForPath("/privacy", "https://example.test")).toBe(
      "https://example.test/privacy",
    );
    expect(canonicalUrlForPath("/privacy/", "https://example.test")).toBe(
      "https://example.test/privacy",
    );
  });

  it("provides unique localized route metadata", () => {
    expect(metadataForPath("/terms", "es").title).not.toBe(
      metadataForPath("/terms", "fr").title,
    );
    expect(metadataForPath("/contact", "es").description).toContain(
      "InstaFetch",
    );
  });

  it("derives social preview assets from the site origin", () => {
    expect(siteAssetUrl("/social-preview.png", "https://instafetch.example")).toBe(
      "https://instafetch.example/social-preview.png",
    );
  });
});
