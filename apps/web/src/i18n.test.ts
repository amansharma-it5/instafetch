import { describe, expect, it } from "vitest";
import { translate } from "./i18n";

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
});
