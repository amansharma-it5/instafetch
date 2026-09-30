import { describe, expect, it } from "vitest";
import { hasTranslation, translate } from "./i18n";

describe("locale messages", () => {
  it("defaults to accurate English status meanings", () => {
    expect(translate("en", "supported.reels.status")).toBe("Verified");
    expect(translate("en", "supported.photo.status")).not.toBe("Verified");
  });

  it("keeps verified and conditional labels distinct in Spanish and French", () => {
    expect(translate("es", "supported.reels.status")).toBe("Verificado");
    expect(translate("es", "supported.photo.status")).not.toBe("Verificado");
    expect(translate("fr", "supported.reels.status")).toBe("Vérifié");
    expect(translate("fr", "supported.carousel.status")).not.toBe("Vérifié");
  });

  it("provides localized error copy without falling back to English", () => {
    const errorCodes = [
      "INVALID_INSTAGRAM_URL",
      "INVALID_YOUTUBE_URL",
      "PLAYLIST_NOT_SUPPORTED",
      "MEDIA_TOO_LONG",
      "PRIVATE_MEDIA",
      "AGE_RESTRICTED",
      "LIVE_NOT_AVAILABLE",
      "DRM_UNSUPPORTED",
      "UNSUPPORTED_MEDIA",
      "PRIVATE_OR_UNAVAILABLE",
      "LOGIN_REQUIRED",
      "YOUTUBE_LOGIN_REQUIRED",
      "RATE_LIMITED",
      "SERVER_BUSY",
      "EXTRACTION_TIMEOUT",
      "EXTRACTION_FAILED",
      "PROVIDER_UNAVAILABLE",
      "TOKEN_PROVIDER_UNAVAILABLE",
      "PROVIDER_MALFORMED_RESPONSE",
      "NETWORK_FAILURE",
      "INVALID_TOKEN",
      "EXPIRED_TOKEN",
      "MEDIA_NOT_FOUND",
      "MEDIA_UNAVAILABLE",
      "MEDIA_TOO_LARGE",
      "UPSTREAM_TIMEOUT",
      "UPSTREAM_INVALID_CONTENT",
      "DOWNLOAD_FAILED",
      "fallback",
    ];
    for (const locale of ["es", "fr"] as const) {
      for (const code of errorCodes) {
        expect(hasTranslation(locale, `error.${code}`)).toBe(true);
      }
    }
  });

  it("keeps the feedback path available in every supported language", () => {
    for (const locale of ["en", "es", "fr"] as const) {
      expect(translate(locale, "feedback.prompt")).toBeTruthy();
      expect(translate(locale, "feedback.helper")).toBeTruthy();
      expect(translate(locale, "feedback.emailBug")).toBeTruthy();
      expect(translate(locale, "feedback.emailFeature")).toBeTruthy();
      expect(translate(locale, "feedback.privacyWarning")).toBeTruthy();
      expect(translate(locale, "feedback.collaboratorLabel")).toBeTruthy();
      expect(translate(locale, "feedback.accessNote")).toBeTruthy();
    }
    expect(translate("en", "feedback.privacyWarning")).toBe(
      "Do not send passwords, cookies, authentication tokens, private media links, or other sensitive information.",
    );
  });
});
