/** Demo access unlocks local features without granting an account or offline licence. */
const loopbackHosts = ["127.0.0.1", "localhost", "[::1]"];

export function isHackathonPreview() {
  return import.meta.env.STATIFY_HOSTED_DEMO === true ||
    import.meta.env.DEV && import.meta.env.MODE === "ai-hackathon" &&
    typeof location !== "undefined" && loopbackHosts.includes(location.hostname);
}

export function isLocalPreview() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  try {
    return (
      loopbackHosts.includes(location.hostname) &&
      window.parent !== window &&
      window.parent.location.origin === location.origin &&
      window.parent.location.pathname === "/preview.html"
    );
  } catch {
    return false;
  }
}
function localMembershipSelected() {
  try {
    return sessionStorage.getItem("statify-preview-access") !== "account";
  } catch {
    return true;
  }
}
export function isGuestPreview() {
  if (isHackathonPreview()) return true;
  return import.meta.env.DEV && import.meta.env.STATIFY_LOCAL_AI_GUEST === "1" &&
    typeof window !== "undefined" && typeof location !== "undefined" &&
    loopbackHosts.includes(location.hostname) &&
    (window.parent === window || (isLocalPreview() && localMembershipSelected()));
}
export function previewMemberActive() {
  return isGuestPreview() || (isLocalPreview() && localMembershipSelected());
}
/** An explicit account logout must also end a local preview grant. */
export function leavePreviewMembership() {
  if (!isLocalPreview()) return;
  try {
    sessionStorage.setItem("statify-preview-access", "account");
    window.parent.postMessage(
      { type: "statify-preview-access", value: "account" },
      location.origin,
    );
  } catch {}
}
