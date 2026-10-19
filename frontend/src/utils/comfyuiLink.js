// The address a link into the owner's ComfyUI opens.
//
// ComfyUI takes no workflow from a URL, so what is to open rides along as
// query parameters the ComfyUI-PixlStash nodes read: `pixlstash_workflow` from
// the Workflow tab, `pixlstash_run` from the Run popup.

/**
 * ComfyUI's `address` with `params` on it, or null when the address in
 * Settings is not a web address.
 *
 * `0.0.0.0` is ComfyUI listening everywhere: fine for the server, and a
 * browser cannot navigate to it. The machine this page came from is the one.
 *
 * @param {string} address
 * @param {Object<string, string>} params
 * @returns {?string}
 */
export function comfyuiLink(address, params) {
  let url;
  try {
    url = new URL(address);
  } catch (err) {
    console.warn(`[workflows] bad ComfyUI address ${address}`, err);
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (["0.0.0.0", "[::]"].includes(url.hostname)) {
    url.hostname = window.location.hostname;
  }
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url.toString();
}
