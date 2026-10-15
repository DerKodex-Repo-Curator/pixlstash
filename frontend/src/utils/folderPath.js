// How a model folder's path is drawn: home as one word, the rest split so the
// last segment survives truncation.

// ponytail: home is recognised by its conventional shape, not asked of the
// server, so a home directory anywhere else is shown as a plain path. Send the
// server's own `~` in `GET /model-folders` if that ever matters.
// `Shared`, `Public` and `Default` sit under a Users folder without being anybody's.
const HOME_RE =
  /^(\/home\/[^/]+|\/Users\/(?!Shared\/)[^/]+|\/root|[A-Za-z]:[\\/]Users[\\/](?!(?:Public|Default)[\\/])[^\\/]+)(?=[\\/])/;

/**
 * Split a path for display.
 *
 * @param {string} path - an absolute host path.
 * @returns {{home: boolean, head: string, tail: string}} `home` when the path
 *   starts in a home directory (which is then dropped from `head`), `tail` the
 *   last segment with its leading separator, `head` everything between.
 */
export function splitFolderPath(path) {
  const full = String(path || "");
  const match = full.match(HOME_RE);
  const rest = match ? full.slice(match[0].length) : full;
  const cut = Math.max(rest.lastIndexOf("/"), rest.lastIndexOf("\\"));
  return {
    home: Boolean(match),
    head: cut > 0 ? rest.slice(0, cut) : "",
    tail: cut >= 0 ? rest.slice(cut) : rest,
  };
}
