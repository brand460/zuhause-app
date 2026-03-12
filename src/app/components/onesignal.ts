/**
 * OneSignal Web Push SDK v16 Integration
 *
 * Robust loader that:
 * 1. Sets up window.OneSignalDeferred BEFORE injecting the script tag
 * 2. Waits for the SDK callback to fire, then calls OneSignal.init()
 * 3. Uses OneSignal.Notifications.requestPermission() (v16 API)
 * 4. Reads OneSignal.User.PushSubscription.id for the player/subscription ID
 *
 * Every step is logged to console so we can trace failures in the browser.
 */

const ONESIGNAL_APP_ID = "a72cfa96-92c3-472b-8fa2-6b61bec1d724";
const SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: any) => void | Promise<void>>;
    OneSignal?: any;
  }
}

// ── Internal state ─────────────────────────────────────────────────
let _sdkInstance: any = null;
let _initPromise: Promise<any> | null = null;

// ── SDK loader ─────────────────────────────────────────────────────

/**
 * Loads the OneSignal Web SDK v16 and calls init().
 * Returns the ready-to-use OneSignal instance.
 * Safe to call multiple times — returns the same promise.
 */
export function initOneSignal(): Promise<any> {
  if (_initPromise) return _initPromise;

  console.log("[OneSignal] initOneSignal() called");

  _initPromise = new Promise<any>((resolve, reject) => {
    // Timeout: if nothing happens within 20s, reject
    const timeout = setTimeout(() => {
      console.log("[OneSignal] ❌ SDK load/init timed out after 20s");
      reject(new Error("OneSignal SDK load timeout (20s)"));
    }, 20_000);

    // 1. Create the deferred queue BEFORE adding the script
    //    The SDK, once loaded, will iterate this array and call each callback.
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    console.log("[OneSignal] Deferred queue ready, length:", window.OneSignalDeferred.length);

    // 2. Push our init callback into the queue
    window.OneSignalDeferred.push(async (OneSignal: any) => {
      console.log("[OneSignal] ✅ SDK deferred callback fired — SDK is loaded");
      try {
        clearTimeout(timeout);

        console.log("[OneSignal] Calling OneSignal.init({ appId:", ONESIGNAL_APP_ID, "})");
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true,
        });
        console.log("[OneSignal] ✅ OneSignal.init() resolved successfully");

        _sdkInstance = OneSignal;
        resolve(OneSignal);
      } catch (err) {
        clearTimeout(timeout);
        console.log("[OneSignal] ❌ OneSignal.init() threw:", err);
        reject(err);
      }
    });

    // 3. Inject the script tag (if not already present)
    if (document.querySelector(`script[src="${SDK_URL}"]`)) {
      console.log("[OneSignal] Script tag already exists in DOM — waiting for deferred callback");
    } else {
      console.log("[OneSignal] Injecting script tag:", SDK_URL);
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.defer = true;
      script.onload = () => console.log("[OneSignal] ✅ Script onload fired");
      script.onerror = (e) => {
        clearTimeout(timeout);
        console.log("[OneSignal] ❌ Script onerror:", e);
        reject(new Error("Failed to load OneSignal SDK script"));
      };
      document.head.appendChild(script);
    }
  });

  return _initPromise;
}

// ── User setup ─────────────────────────────────────────────────────

/**
 * Full push setup for a logged-in user:
 * 1. Init SDK (if not already done)
 * 2. Set external user ID = Supabase user ID
 * 3. Request notification permission via native browser prompt
 * 4. Read + return the subscription (player) ID
 *
 * Returns the player ID string, or null if permission denied / unavailable.
 */
export async function setupPushForUser(userId: string): Promise<string | null> {
  console.log("[OneSignal] setupPushForUser() called, userId:", userId);

  try {
    // Step 1: Init
    console.log("[OneSignal] Step 1 — Waiting for SDK init…");
    const OS = await initOneSignal();
    console.log("[OneSignal] Step 1 ✅ SDK ready");

    // Step 2: Set external user ID
    console.log("[OneSignal] Step 2 — Calling OneSignal.login(", userId, ")");
    try {
      await OS.login(userId);
      console.log("[OneSignal] Step 2 ✅ External user ID set");
    } catch (loginErr) {
      console.log("[OneSignal] Step 2 ⚠️ login() error (non-fatal):", loginErr);
    }

    // Step 3: Check current permission + subscription
    const currentPermission = OS.Notifications?.permission;
    const currentSubId = OS.User?.PushSubscription?.id;
    console.log("[OneSignal] Step 3 — Current permission:", currentPermission, "| Current sub ID:", currentSubId);

    if (currentSubId) {
      console.log("[OneSignal] Step 3 ✅ Already subscribed, returning player ID:", currentSubId);
      return currentSubId;
    }

    // Step 4: Request permission (native browser prompt)
    console.log("[OneSignal] Step 4 — Requesting notification permission…");
    try {
      // v16 API: Notifications.requestPermission() triggers the native prompt
      if (OS.Notifications?.requestPermission) {
        await OS.Notifications.requestPermission();
        console.log("[OneSignal] Step 4 ✅ requestPermission() resolved");
      } else if (OS.Slidedown?.promptPush) {
        // Fallback for older SDK builds
        console.log("[OneSignal] Step 4 — Falling back to Slidedown.promptPush()");
        await OS.Slidedown.promptPush();
        console.log("[OneSignal] Step 4 ✅ promptPush() resolved");
      } else {
        console.log("[OneSignal] Step 4 ⚠️ No permission API found on SDK instance");
      }
    } catch (permErr) {
      // User dismissed or denied — not fatal
      console.log("[OneSignal] Step 4 ⚠️ Permission request error/dismissed:", permErr);
    }

    // Step 5: Read the subscription ID (may appear with a delay)
    console.log("[OneSignal] Step 5 — Waiting for subscription ID…");

    const postPermissionCheck = OS.Notifications?.permission;
    console.log("[OneSignal] Step 5 — Permission after request:", postPermissionCheck);

    // Immediate check
    let subId = OS.User?.PushSubscription?.id || null;
    if (subId) {
      console.log("[OneSignal] Step 5 ✅ Subscription ID available immediately:", subId);
      return subId;
    }

    // Wait with a listener + polling fallback
    subId = await new Promise<string | null>((resolve) => {
      let resolved = false;
      const done = (id: string | null, source: string) => {
        if (resolved) return;
        resolved = true;
        console.log(`[OneSignal] Step 5 — Resolved via ${source}:`, id);
        resolve(id);
      };

      // Timeout: give up after 8s
      const giveUpTimer = setTimeout(() => {
        const finalId = OS.User?.PushSubscription?.id || null;
        done(finalId, "timeout (8s)");
      }, 8000);

      // Listener for subscription change events
      try {
        OS.User.PushSubscription.addEventListener("change", (event: any) => {
          clearTimeout(giveUpTimer);
          done(event?.current?.id || null, "change event");
        });
        console.log("[OneSignal] Step 5 — Subscription change listener attached");
      } catch (listenerErr) {
        console.log("[OneSignal] Step 5 ⚠️ Could not attach change listener:", listenerErr);
      }

      // Poll every 500ms
      let pollCount = 0;
      const pollTimer = setInterval(() => {
        pollCount++;
        const id = OS.User?.PushSubscription?.id;
        if (id) {
          clearInterval(pollTimer);
          clearTimeout(giveUpTimer);
          done(id, `poll #${pollCount}`);
        }
        if (pollCount >= 16) {
          // 8s reached via polling
          clearInterval(pollTimer);
        }
      }, 500);
    });

    if (subId) {
      console.log("[OneSignal] ✅ Final player ID:", subId);
    } else {
      console.log("[OneSignal] ⚠️ No subscription ID obtained (permission denied or service worker issue)");
    }
    return subId;
  } catch (err) {
    console.log("[OneSignal] ❌ setupPushForUser() fatal error:", err);
    return null;
  }
}

/**
 * Returns the current subscription/player ID without prompting.
 */
export async function getPlayerId(): Promise<string | null> {
  try {
    if (_sdkInstance) {
      return _sdkInstance.User?.PushSubscription?.id || null;
    }
    const OS = await initOneSignal();
    return OS.User?.PushSubscription?.id || null;
  } catch {
    return null;
  }
}

/**
 * Logout: clears the external user ID mapping on OneSignal's side.
 */
export async function logoutOneSignal(): Promise<void> {
  try {
    const os = _sdkInstance || window.OneSignal;
    if (os) {
      console.log("[OneSignal] Calling logout()");
      await os.logout();
      console.log("[OneSignal] ✅ Logged out");
    }
  } catch (err) {
    console.log("[OneSignal] Logout error:", err);
  }
}
