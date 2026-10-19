// The address a link into ComfyUI opens. What can silently go wrong: a
// wildcard address a browser cannot navigate to is left as it is, or an
// address that is not a web address is opened anyway.

import { afterEach, describe, expect, it, vi } from "vitest";

import { comfyuiLink } from "./comfyuiLink";

describe("comfyuiLink", () => {
  afterEach(() => vi.restoreAllMocks());

  it("puts the parameters on the address, in the order given", () => {
    expect(
      comfyuiLink("http://127.0.0.1:8188/", { pixlstash_run: "abc", pixlstash_of: "auto:1" }),
    ).toBe("http://127.0.0.1:8188/?pixlstash_run=abc&pixlstash_of=auto%3A1");
    expect(comfyuiLink("https://comfy.example.com/ui/", {})).toBe(
      "https://comfy.example.com/ui/",
    );
  });

  it("sends an address ComfyUI only listens on to the page's own host", () => {
    // `URL.hostname` keeps the brackets of an IPv6 literal, so the wildcard
    // reads "[::]" there and not "::".
    expect(new URL("http://[::]:8188/").hostname).toBe("[::]");
    for (const wildcard of ["http://0.0.0.0:8188/", "http://[::]:8188/"]) {
      expect(comfyuiLink(wildcard, { a: "1" })).toBe(
        `http://${window.location.hostname}:8188/?a=1`,
      );
    }
    // A real address is left alone, loopback over IPv6 included.
    expect(comfyuiLink("http://[::1]:8188/", {})).toBe("http://[::1]:8188/");
  });

  it("answers null for what is not a web address", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const bad of ["", "not a url", "file:///home/me/comfy", "javascript:alert(1)"]) {
      expect(comfyuiLink(bad, { a: "1" })).toBeNull();
    }
  });
});
