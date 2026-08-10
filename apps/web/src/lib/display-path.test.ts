import { describe, expect, it } from "vitest";
import { formatLibraryHomeDisplay } from "./display-path";

describe("formatLibraryHomeDisplay", () => {
  it("collapses default .sigmadesign under home", () => {
    expect(
      formatLibraryHomeDisplay("/Users/someone/.sigmadesign", "/Users/someone")
    ).toBe("~/.sigmadesign");
  });

  it("collapses arbitrary paths under home", () => {
    expect(
      formatLibraryHomeDisplay(
        "/Users/someone/Projects/lib",
        "/Users/someone"
      )
    ).toBe("~/Projects/lib");
  });

  it("collapses /Users/name without explicit homeDir", () => {
    expect(formatLibraryHomeDisplay("/Users/arhamkhan/.sigmadesign")).toBe(
      "~/.sigmadesign"
    );
  });

  it("collapses /home/name paths", () => {
    expect(formatLibraryHomeDisplay("/home/dev/.sigmadesign")).toBe(
      "~/.sigmadesign"
    );
  });

  it("leaves non-home absolute paths unchanged", () => {
    expect(formatLibraryHomeDisplay("/data/sigmadesign")).toBe(
      "/data/sigmadesign"
    );
  });
});
