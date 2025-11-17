const fs = require("fs").promises;
const path = require("path");

/**
 * Generate a default server icon placeholder (colored circle with first letter)
 */
function generateDefaultServerIcon(communityName, communityId) {
  const firstLetter = (communityName && communityName.length > 0)
    ? communityName.charAt(0).toUpperCase()
    : "?";

  let hash = 0;
  for (let i = 0; i < communityId.length; i++) {
    hash = communityId.charCodeAt(i) + ((hash << 5) - hash);
  }

  const colors = [
    "#5865F2", "#57F287", "#FEE75C", "#ED4245", "#EB459E",
    "#95A5A6", "#3498DB", "#E67E22", "#9B59B6", "#1ABC9C",
  ];
  const colorIndex = Math.abs(hash) % colors.length;
  const bgColor = colors[colorIndex];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="16" fill="${bgColor}"/>
    <text x="16" y="16" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${firstLetter}</text>
  </svg>`;

  return "data:image/svg+xml," + encodeURIComponent(svg);
}

/**
 * Generate a random state token (similar to Collab.Land format)
 */
function generateStateToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 15; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Extract user ID from Discord avatar URL
 */
function extractUserIdFromAvatarUrl(url) {
  if (!url || !url.includes("discordapp.com")) return null;
  const match = url.match(/\/avatars\/(\d+)\//);
  return match ? match[1] : null;
}

/**
 * Extract guild ID from Discord icon URL
 */
function extractGuildIdFromIconUrl(url) {
  if (!url || !url.includes("discordapp.com")) return null;
  const match = url.match(/\/icons\/(\d+)\//);
  return match ? match[1] : null;
}

/**
 * Generate URL in Collab.Land format: evm?state=...&id=...&callbackURL=...
 */
function generateCollabLandUrl(
  baseUrl,
  userData,
  options = {}
) {
  // Generate state token (random 15-character string)
  const state = generateStateToken();

  // For the 'id' parameter, you have two options:
  // 1. Use a JWE token from Collab.Land's API (recommended)
  // 2. Create a custom encrypted token with your data
  //
  // For now, if no JWE token is provided, we'll create a base64-encoded
  // JSON string with the user data (this is NOT a real JWE, just a placeholder)
  let id;

  if (options?.jweToken) {
    // Use provided JWE token (from Collab.Land API)
    id = options.jweToken;
  } else {
    // Create a custom token with user data (base64-encoded JSON)
    // In production, you should encrypt this properly or use Collab.Land's API
    // Always extract avatar hashes so we can reconstruct URLs on client side
    let avatarHash = null;
    let iconHash = null;
    
    // Prefer hash passed directly from bot (more reliable)
    if (userData.userAvatarHash) {
      avatarHash = userData.userAvatarHash;
      console.log(`[URL Gen] Using avatar hash passed directly from bot: ${avatarHash}`);
    } else if (userData.userAvatar) {
      // Fallback: Extract avatar hash from URL
      // Try to match custom avatar: /avatars/USER_ID/HASH.EXT
      const match = userData.userAvatar.match(/\/avatars\/\d+\/([a-zA-Z0-9_]+)\.(png|gif|webp|jpg|jpeg)/);
      if (match) {
        avatarHash = match[1];
        console.log(`[URL Gen] Extracted avatar hash: ${avatarHash} from URL: ${userData.userAvatar.substring(0, 80)}...`);
      } else {
        // Check if it's a default avatar: /embed/avatars/INDEX.png
        const defaultMatch = userData.userAvatar.match(/\/embed\/avatars\/(\d+)\.png/);
        if (defaultMatch) {
          // For default avatars, we don't need a hash - the client will use the default URL
          console.log(`[URL Gen] Default avatar detected (index ${defaultMatch[1]}), no hash needed`);
          avatarHash = null; // Will use default avatar URL directly
        } else {
          console.log(`[URL Gen] Could not extract avatar hash from URL: ${userData.userAvatar}`);
        }
      }
    } else {
      console.log(`[URL Gen] No userAvatar provided`);
    }
    
    // Prefer hash passed directly from bot (more reliable)
    if (userData.guildIconHash) {
      iconHash = userData.guildIconHash;
      console.log(`[URL Gen] Using icon hash passed directly from bot: ${iconHash}`);
    } else if (userData.guildIcon) {
      // Fallback: Extract icon hash from URL
      const match = userData.guildIcon.match(/\/icons\/\d+\/([a-zA-Z0-9_]+)\.(png|gif|webp|jpg|jpeg)/);
      if (match) {
        iconHash = match[1];
        console.log(`[URL Gen] Extracted icon hash: ${iconHash} from URL: ${userData.guildIcon.substring(0, 80)}...`);
      } else {
        console.log(`[URL Gen] Could not extract icon hash from URL: ${userData.guildIcon}`);
      }
    } else {
      console.log(`[URL Gen] No guildIcon provided`);
    }
    
    const data = {
      u: userData.userName, // Shortened key
      c: userData.communityName,
      ci: userData.communityId,
      i: userData.interactionId,
      // Include full URLs first (if they fit)
      av: userData.userAvatar || null, // Avatar URL
      gi: userData.guildIcon || null, // Guild icon URL
      // Always include IDs and hashes for reconstruction
      uid: userData.userId || (userData.userAvatar ? extractUserIdFromAvatarUrl(userData.userAvatar) : null),
      gid: userData.guildId || (userData.guildIcon ? extractGuildIdFromIconUrl(userData.guildIcon) : null),
      ah: avatarHash, // Avatar hash (for URL reconstruction)
      ih: iconHash,   // Icon hash (for URL reconstruction)
      t: userData.timestamp,
      ts: userData.timestampIso || null,
      exp: userData.expiresAt || null,
      em: userData.expirationMinutes || 6,
    };
    let jsonStr = JSON.stringify(data);
    id = Buffer.from(jsonStr).toString("base64");
    
    console.log(`[URL Gen] Initial data includes - av: ${!!data.av}, gi: ${!!data.gi}, ah: ${data.ah || 'none'}, ih: ${data.ih || 'none'}`);
    console.log(`[URL Gen] Initial data size: ${jsonStr.length} chars, base64: ${id.length} chars`);
    console.log(`[URL Gen] Full initial data:`, JSON.stringify(data, null, 2));
    
    // Check if URL would be too long (Discord limit is 512 chars)
    let testUrl = `${baseUrl.replace(/\/$/, "")}/evm?state=${state}&id=${id}`;
    console.log(`[URL Gen] Initial URL length: ${testUrl.length} chars`);
    console.log(`[URL Gen] Initial id value: ${id ? id.substring(0, 50) + '...' : 'UNDEFINED!'}`);
    
    // IMPORTANT: Even if URL is short, we should still include hashes for reconstruction
    // But if URL is already short enough, return it as-is (hashes are already included)
    if (testUrl.length <= 500) {
      console.log(`[URL Gen] URL is short enough (${testUrl.length} chars), keeping initial data with hashes`);
      // Hashes are already in the data object, so we're good - id is already set above
    } else {
      console.log(`[URL Gen] URL is too long (${testUrl.length} chars), attempting to shorten...`);
      // Try shortening user/community names first (they're less critical than avatars)
      const shortenedData = {
        u: userData.userName.length > 20 ? userData.userName.substring(0, 20) : userData.userName,
        c: userData.communityName.length > 20 ? userData.communityName.substring(0, 20) : userData.communityName,
        ci: userData.communityId,
        i: userData.interactionId,
        // Try to keep avatar URLs - they're more important than full names
        av: userData.userAvatar || null,
        gi: userData.guildIcon || null,
        uid: userData.userId || (userData.userAvatar ? extractUserIdFromAvatarUrl(userData.userAvatar) : null),
        gid: userData.guildId || (userData.guildIcon ? extractGuildIdFromIconUrl(userData.guildIcon) : null),
        // Always keep hashes - they're small and essential
        ah: avatarHash,
        ih: iconHash,
        t: userData.timestamp,
        ts: userData.timestampIso || null,
        exp: userData.expiresAt || null,
        em: userData.expirationMinutes || 6,
      };
      jsonStr = JSON.stringify(shortenedData);
      id = Buffer.from(jsonStr).toString("base64");
      testUrl = `${baseUrl.replace(/\/$/, "")}/evm?state=${state}&id=${id}`;
      
      // If still too long, try removing timestamp but keep avatar hashes
      if (testUrl.length > 500) {
        const noTimestampData = {
          u: shortenedData.u,
          c: shortenedData.c,
          ci: userData.communityId,
          i: userData.interactionId,
          // Remove full URLs if too long, but keep hashes
          av: null, // Remove full URL to save space
          gi: null, // Remove full URL to save space
          uid: userData.userId || (userData.userAvatar ? extractUserIdFromAvatarUrl(userData.userAvatar) : null),
          gid: userData.guildId || (userData.guildIcon ? extractGuildIdFromIconUrl(userData.guildIcon) : null),
          // Keep hashes - they're small and essential for reconstruction
          ah: avatarHash,
          ih: iconHash,
        ts: userData.timestampIso || null,
        exp: userData.expiresAt || null,
        em: userData.expirationMinutes || 6,
        };
        jsonStr = JSON.stringify(noTimestampData);
        id = Buffer.from(jsonStr).toString("base64");
        testUrl = `${baseUrl.replace(/\/$/, "")}/evm?state=${state}&id=${id}`;
      }
      
      // Last resort: remove everything except essentials + hashes
      // Hashes are small (typically 32 chars) and essential for avatar reconstruction
      if (testUrl.length > 500) {
        const minimalData = {
          u: shortenedData.u,
          c: shortenedData.c,
          ci: userData.communityId,
          i: userData.interactionId,
          uid: userData.userId || (userData.userAvatar ? extractUserIdFromAvatarUrl(userData.userAvatar) : null),
          gid: userData.guildId || (userData.guildIcon ? extractGuildIdFromIconUrl(userData.guildIcon) : null),
          // Keep hashes - they're small and essential for reconstruction
          ah: avatarHash, // Avatar hash (typically ~32 chars)
          ih: iconHash,   // Icon hash (typically ~32 chars)
          ts: userData.timestampIso || null,
          exp: userData.expiresAt || null,
          em: userData.expirationMinutes || 6,
        };
        jsonStr = JSON.stringify(minimalData);
        id = Buffer.from(jsonStr).toString("base64");
        testUrl = `${baseUrl.replace(/\/$/, "")}/evm?state=${state}&id=${id}`;
        
        // If STILL too long after removing URLs and timestamp, we have to drop hashes
        // This should be very rare - only happens with very long base URLs
        if (testUrl.length > 500) {
          const finalData = {
            u: shortenedData.u,
            c: shortenedData.c,
            ci: userData.communityId,
            i: userData.interactionId,
            uid: userData.userId || (userData.userAvatar ? extractUserIdFromAvatarUrl(userData.userAvatar) : null),
            gid: userData.guildId || (userData.guildIcon ? extractGuildIdFromIconUrl(userData.guildIcon) : null),
            // Hashes removed - will use default avatars on client
          ts: userData.timestampIso || null,
          exp: userData.expiresAt || null,
          em: userData.expirationMinutes || 6,
          };
          jsonStr = JSON.stringify(finalData);
          id = Buffer.from(jsonStr).toString("base64");
          testUrl = `${baseUrl.replace(/\/$/, "")}/evm?state=${state}&id=${id}`;
          console.log(`[URL Gen] After removing hashes, URL length: ${testUrl.length} chars`);
        }
      }
    }
    
    // Verify id is set after all shortening attempts
    if (!id || typeof id !== 'string' || id.length === 0) {
      console.error(`[URL Gen] ERROR: id is invalid after shortening! Type: ${typeof id}, Value: ${id}`);
      // Try to regenerate with minimal data as fallback
      const fallbackData = {
        u: userData.userName ? userData.userName.substring(0, 10) : 'user',
        c: userData.communityName ? userData.communityName.substring(0, 10) : 'server',
        ci: userData.communityId || '0',
        i: userData.interactionId || '0',
        uid: userData.userId || '0',
        gid: userData.guildId || '0',
        ts: userData.timestampIso || null,
        exp: userData.expiresAt || null,
        em: userData.expirationMinutes || 6,
      };
      const fallbackJson = JSON.stringify(fallbackData);
      id = Buffer.from(fallbackJson).toString("base64");
      console.log(`[URL Gen] Generated fallback id: ${id.substring(0, 50)}...`);
    }
    
    // Final check: ensure hashes are in the final data (decode and re-encode if needed)
    if (id && typeof id === 'string' && id.length > 0) {
      try {
        const decoded = Buffer.from(id, "base64").toString("utf-8");
        const finalData = JSON.parse(decoded);
        if ((!finalData.ah && avatarHash) || (!finalData.ih && iconHash)) {
          console.log(`[URL Gen] WARNING: Hashes missing from final data, adding them...`);
          if (!finalData.ah && avatarHash) finalData.ah = avatarHash;
          if (!finalData.ih && iconHash) finalData.ih = iconHash;
          const newJsonStr = JSON.stringify(finalData);
          id = Buffer.from(newJsonStr).toString("base64");
          console.log(`[URL Gen] Fixed: Added missing hashes to final data`);
        }
        console.log(`[URL Gen] Final data verification - ah: ${finalData.ah || 'none'}, ih: ${finalData.ih || 'none'}`);
      } catch (e) {
        console.log(`[URL Gen] Could not verify final data: ${e.message}`);
        // If verification fails, don't fail the whole function - id should still be valid
      }
    } else {
      console.error(`[URL Gen] ERROR: id is invalid before final verification! Type: ${typeof id}, Value: ${id}`);
    }
  }

  // Ensure id is set and valid
  if (!id || typeof id !== 'string' || id.length === 0) {
    console.error(`[URL Gen] FATAL: id is invalid! type: ${typeof id}, value: ${id}`);
    throw new Error(`Failed to generate id parameter - id is ${typeof id === 'undefined' ? 'undefined' : 'invalid'}`);
  }
  
  // Build URL in Collab.Land format: evm?state=...&id=...&callbackURL=...
  const params = new URLSearchParams();
  params.append("state", state);
  params.append("id", id);

  // Only add callbackURL if provided (optional)
  if (options?.callbackURL) {
    params.append("callbackURL", options.callbackURL);
  }

  // Ensure baseUrl doesn't end with /
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");

  const appendEvmPath = typeof options?.appendEvmPath === "boolean"
    ? options.appendEvmPath
    : !/\/slugs\//i.test(cleanBaseUrl);

  let finalUrl;
  if (!appendEvmPath) {
    const separator = cleanBaseUrl.includes("?") ? "&" : "?";
    finalUrl = `${cleanBaseUrl}${separator}${params.toString()}`;
  } else {
    finalUrl = `${cleanBaseUrl}/evm?${params.toString()}`;
  }

  if (options?.includeMeta) {
    return {
      url: finalUrl,
      state,
      id,
    };
  }

  return finalUrl;
}

/**
 * Generate URL with query parameters for personalized data (original format)
 * Kept for backward compatibility
 */
function generatePersonalizedUrl(baseUrl, userData) {
  const params = new URLSearchParams();
  params.append("userName", userData.userName || "");
  params.append("communityName", userData.communityName || "");
  params.append("communityId", userData.communityId || "");
  params.append("interactionId", userData.interactionId || "");
  params.append("userAvatar", userData.userAvatar || "");
  params.append("guildIcon", userData.guildIcon || "");
  if (userData.timestamp) {
    params.append("timestamp", userData.timestamp);
  }

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Base CSS for the personalized card - injected early to prevent flashes
 */
function getCardStyleBlock() {
  return `
<style id="collab-land-card-style">
  /* Hide personalized card by default - very strong CSS */
  .sc-iqPaeV.ijefWr {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
  
  .sc-iqPaeV.ijefWr.show {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
    transition: opacity 0.12s ease-in-out;
  }
  
  .sc-iqPaeV.ijefWr .sc-eKJbhj.bvTcOo {
    background-image: none !important;
    background: none !important;
  }
  
  .status-indicator {
    position: absolute;
    top: -1px;
    right: -5px;
    width: 10px;
    height: 10px;
    background-color: rgba(11, 194, 170, 0.957);
    border: none;
    border-radius: 50%;
    z-index: 9999;
    box-shadow: 0 0 0 0 rgba(11, 194, 170, 0.4);
    animation: pulse-teal 2s ease-in-out infinite;
    pointer-events: none;
  }
  
  .avatar-hover-container {
    position: relative;
    display: inline-block;
  }

  #collab-land-expired-overlay {
    position: fixed;
    inset: 0;
    background: rgba(6, 6, 8, 0.94);
    color: #f4f6fb;
    display: none;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    z-index: 2147483647;
  }

  #collab-land-expired-overlay.active {
    display: flex;
  }

  .collab-expired-card {
    max-width: 460px;
    width: 100%;
    background: rgba(22, 24, 35, 0.95);
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .collab-expired-card h1 {
    font-size: 1.75rem;
    margin-bottom: 12px;
    color: #ffffff;
  }

  .collab-expired-card p {
    margin: 0;
    color: rgba(255, 255, 255, 0.82);
    line-height: 1.5;
  }

  .collab-expired-card .collab-expired-meta {
    margin-top: 16px;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.65);
  }
  
  @keyframes pulse-teal {
    0% {
      box-shadow: 0 0 0 0 rgba(11, 194, 170, 0.4);
    }
    40% {
      box-shadow: 0 0 0 6px rgba(11, 194, 170, 0);
    }
    60% {
      box-shadow: 0 0 0 0 rgba(11, 194, 170, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(11, 194, 170, 0);
    }
  }
</style>
`;
}

/**
 * Generate script that reads URL parameters and populates the page
 */
function generateUrlParamsScript() {
  return `
<script>
(function() {
    // Get URL parameters
    // Support both Collab.Land format (state, id) and original format (userName, etc.)
    const urlParams = new URLSearchParams(window.location.search);
    
    let userName, communityName, communityId, interactionId, userAvatar, guildIcon;
    let cardMutationObserver = null;
    let isApplyingContent = false;
    const FALLBACK_EXPIRATION_MINUTES = 6;
    const expirationState = {
        expiresAtMs: null,
        createdAtMs: null,
        generatedLabel: null,
        expirationMinutes: FALLBACK_EXPIRATION_MINUTES,
        timerId: null,
        isExpired: false,
    };
    
    // Check if using Collab.Land format (state, id)
    const state = urlParams.get('state');
    const id = urlParams.get('id');
    const payloadFromServer = typeof window !== 'undefined' ? window.__COLLAB_LAND_PAYLOAD__ : null;
    let payloadApplied = false;
    
    function decodeIdPayload(rawId) {
      if (!rawId || typeof rawId !== 'string') {
        return null;
      }
      try {
        let normalized = rawId.trim();
        if (normalized.length === 0) {
          return null;
        }
        normalized = normalized.replace(/ /g, '+');
        normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
        const paddingNeeded = (4 - (normalized.length % 4)) % 4;
        if (paddingNeeded) {
          normalized = normalized + '='.repeat(paddingNeeded);
        }
        const decoded = atob(normalized);
        return JSON.parse(decoded);
      } catch (error) {
        console.error('Could not decode id parameter:', error);
        return null;
      }
    }
    
    function applyPayloadData(data, sourceLabel = 'payload') {
      if (!data || typeof data !== 'object') {
        return false;
      }
      
      userName = data.userName || data.u || '';
      communityName = data.communityName || data.c || '';
      communityId = data.communityId || data.ci || '';
      interactionId = data.interactionId || data.i || '';
      userAvatar = data.userAvatar || data.av || null;
      guildIcon = data.guildIcon || data.gi || null;
      
      if (userAvatar === '' || userAvatar === 'null') userAvatar = null;
      if (guildIcon === '' || guildIcon === 'null') guildIcon = null;
      
      console.log('Decoded data (' + sourceLabel + '):', {
        userName: userName,
        communityName: communityName,
        hasUserAvatar: !!userAvatar,
        hasGuildIcon: !!guildIcon,
        userId: data.uid,
        guildId: data.gid,
        hasAvatarHash: !!data.ah,
        hasIconHash: !!data.ih,
        avatarHash: data.ah || 'none',
        iconHash: data.ih || 'none'
      });
      
      const timestampIso = data.timestampIso || data.ts || null;
      const expiresAtIso = data.expiresAt || data.exp || null;
      const minutesFromPayload = Number(data.expirationMinutes || data.em || FALLBACK_EXPIRATION_MINUTES);
      expirationState.expirationMinutes = Number.isFinite(minutesFromPayload) && minutesFromPayload > 0
        ? minutesFromPayload
        : FALLBACK_EXPIRATION_MINUTES;
      expirationState.generatedLabel = data.timestamp || data.t || null;
      expirationState.createdAtMs = parseTimestampValue(timestampIso);
      const expiresAtMs = parseTimestampValue(expiresAtIso);
      if (expiresAtMs) {
          expirationState.expiresAtMs = expiresAtMs;
      } else if (expirationState.createdAtMs) {
          expirationState.expiresAtMs = expirationState.createdAtMs + (expirationState.expirationMinutes * 60 * 1000);
      }
      if (expirationState.expiresAtMs) {
          expirationState.isExpired = Date.now() >= expirationState.expiresAtMs;
      }
      
      if (!userAvatar && data.ah && data.uid) {
        const extension = data.ah.startsWith('a_') ? 'gif' : 'png';
        userAvatar = 'https://cdn.discordapp.com/avatars/' + data.uid + '/' + data.ah + '.' + extension + '?size=128';
        console.log('Reconstructed user avatar from hash:', userAvatar);
      } else if (!userAvatar && data.uid) {
        const defaultAvatarIndex = parseInt(data.uid) % 5;
        userAvatar = 'https://cdn.discordapp.com/embed/avatars/' + defaultAvatarIndex + '.png?size=128';
        console.log('Using default user avatar:', userAvatar);
      }
      
      if (!guildIcon && data.ih && data.gid) {
        const extension = data.ih.startsWith('a_') ? 'gif' : 'png';
        guildIcon = 'https://cdn.discordapp.com/icons/' + data.gid + '/' + data.ih + '.' + extension + '?size=256';
        console.log('Reconstructed guild icon from hash:', guildIcon);
      } else if (!guildIcon && data.gid) {
        console.log('No guild icon URL or hash found, will use fallback icon generator');
      }
      
      return true;
    }
    
    if (payloadFromServer) {
      payloadApplied = applyPayloadData(payloadFromServer, 'server payload');
    }
    
    if (!payloadApplied && state && id) {
      const data = decodeIdPayload(id);
      if (data) {
        payloadApplied = applyPayloadData(data, 'url payload');
      } else {
        console.warn('If using Collab.Land JWE or an unknown id format, implement decryption.');
        userName = '';
        communityName = '';
        communityId = '';
        interactionId = '';
        userAvatar = null;
        guildIcon = null;
      }
    }
    
    if (!payloadApplied) {
      // Original format: direct parameters
      userName = decodeURIComponent(urlParams.get('userName') || '');
      communityName = decodeURIComponent(urlParams.get('communityName') || '');
      communityId = urlParams.get('communityId') || '';
      interactionId = urlParams.get('interactionId') || '';
      userAvatar = decodeURIComponent(urlParams.get('userAvatar') || '');
      guildIcon = decodeURIComponent(urlParams.get('guildIcon') || '');
      const legacyTimestampLabel = urlParams.get('timestamp') || urlParams.get('t');
      const legacyTimestampIso = urlParams.get('timestampIso') || urlParams.get('ts') || legacyTimestampLabel;
      const legacyExpiresAt = urlParams.get('expiresAt') || urlParams.get('exp');
      const legacyMinutes = Number(urlParams.get('expirationMinutes') || urlParams.get('em'));
      if (legacyTimestampLabel) {
          expirationState.generatedLabel = legacyTimestampLabel;
      }
      expirationState.createdAtMs = parseTimestampValue(legacyTimestampIso);
      expirationState.expirationMinutes = Number.isFinite(legacyMinutes) && legacyMinutes > 0
        ? legacyMinutes
        : expirationState.expirationMinutes;
      const legacyExpiresAtMs = parseTimestampValue(legacyExpiresAt);
      if (legacyExpiresAtMs) {
          expirationState.expiresAtMs = legacyExpiresAtMs;
      } else if (expirationState.createdAtMs) {
          expirationState.expiresAtMs = expirationState.createdAtMs + (expirationState.expirationMinutes * 60 * 1000);
      }
      if (expirationState.expiresAtMs) {
          expirationState.isExpired = Date.now() >= expirationState.expiresAtMs;
      }
    }
    
    function generateDefaultServerIcon(communityName, communityId) {
        const firstLetter = (communityName && communityName.length > 0) 
            ? communityName.charAt(0).toUpperCase() 
            : '?';
        let hash = 0;
        for (let i = 0; i < communityId.length; i++) {
            hash = communityId.charCodeAt(i) + ((hash << 5) - hash);
        }
        const colors = ['#5865F2', '#57F287', '#FEE75C', '#ED4245', '#EB459E', '#95A5A6', '#3498DB', '#E67E22', '#9B59B6', '#1ABC9C'];
        const colorIndex = Math.abs(hash) % colors.length;
        const bgColor = colors[colorIndex];
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="' + bgColor + '"/><text x="16" y="16" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">' + firstLetter + '</text></svg>';
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }
    
    const fallbackServerIcon = generateDefaultServerIcon(communityName, communityId);
    const serverIcon = (guildIcon && guildIcon !== 'null' && guildIcon !== '') ? guildIcon : fallbackServerIcon;
    
    if (expirationState.isExpired) {
        runWhenDomReady(showExpirationOverlay);
    }
    
    function parseTimestampValue(value) {
        if (!value) return null;
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    
    function runWhenDomReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }
    
    function showExpirationOverlay() {
        expirationState.isExpired = true;
        hideCard();
        let overlay = document.getElementById('collab-land-expired-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'collab-land-expired-overlay';
            const card = document.createElement('div');
            card.className = 'collab-expired-card';
            
            const title = document.createElement('h1');
            title.textContent = 'Verification link expired';
            const message = document.createElement('p');
            message.innerHTML = 'For your security, each wallet connection link works for ' + expirationState.expirationMinutes + ' minutes. Please return to Discord and request a new link to continue.';
            
            card.appendChild(title);
            card.appendChild(message);
            
            const metaDetails = [];
            if (expirationState.generatedLabel) {
                metaDetails.push('Generated: ' + expirationState.generatedLabel);
            }
            if (expirationState.expiresAtMs) {
                const expiresAt = new Date(expirationState.expiresAtMs);
                metaDetails.push('Expired at ' + expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }
            if (metaDetails.length > 0) {
                const meta = document.createElement('div');
                meta.className = 'collab-expired-meta';
                meta.textContent = metaDetails.join(' · ');
                card.appendChild(meta);
            }
            
            overlay.appendChild(card);
            document.body.appendChild(overlay);
        }
        overlay.classList.add('active');
    }
    
    function scheduleExpirationCheck() {
        if (!expirationState.expiresAtMs) {
            return;
        }
        if (expirationState.timerId) {
            clearTimeout(expirationState.timerId);
        }
        const remaining = expirationState.expiresAtMs - Date.now();
        if (remaining <= 0) {
            runWhenDomReady(showExpirationOverlay);
            return;
        }
        expirationState.timerId = setTimeout(() => {
            showExpirationOverlay();
        }, remaining);
    }
    
    // Ensure userAvatar is valid
    if (!userAvatar || userAvatar === 'null' || userAvatar === '') {
      // Generate a default user avatar placeholder
      userAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png?size=128';
    }
    
    // Debug logging
    console.log('Final avatar URLs:', {
      userAvatar: userAvatar ? userAvatar.substring(0, 60) + '...' : 'none',
      serverIcon: serverIcon ? (typeof serverIcon === 'string' && serverIcon.length > 60 ? serverIcon.substring(0, 60) + '...' : 'data URI or short') : 'none'
    });
    
    function ensureCardDataAttributes(card) {
        if (!card) return;
        const rowList = card.querySelectorAll('.sc-kSGOQU .sc-dvEHMn');
        if (!rowList || rowList.length === 0) return;
        const rows = Array.from(rowList);
        
        const userRow = card.querySelector('[data-personalized-row="user"]') || rows[0];
        if (userRow) {
            userRow.dataset.personalizedRow = 'user';
            const userImgNode = userRow.querySelector('img');
            if (userImgNode) {
                userImgNode.setAttribute('data-personalized-avatar', 'true');
            }
            const userNameNode = userRow.querySelector('.sc-elAWhN');
            if (userNameNode) {
                userNameNode.setAttribute('data-personalized-username', 'true');
            }
        }
        
        const serverRow = card.querySelector('[data-personalized-row="server"]') || rows[1];
        if (serverRow) {
            serverRow.dataset.personalizedRow = 'server';
            const serverImgNode = serverRow.querySelector('img');
            if (serverImgNode) {
                serverImgNode.setAttribute('data-personalized-icon', 'true');
            }
            const serverNameNode = serverRow.querySelector('.sc-elAWhN');
            if (serverNameNode) {
                serverNameNode.setAttribute('data-personalized-community', 'true');
            }
            const serverIdNode = serverRow.querySelector('.sc-kiPvrU');
            if (serverIdNode) {
                serverIdNode.setAttribute('data-personalized-community-id', 'true');
            }
        }
        
        const interactionRow = card.querySelector('[data-personalized-row="interaction"]') || rows[2];
        if (interactionRow) {
            interactionRow.dataset.personalizedRow = 'interaction';
            const interactionIdNode = interactionRow.querySelector('.sc-kiPvrU');
            if (interactionIdNode) {
                interactionIdNode.setAttribute('data-personalized-interaction-id', 'true');
            }
        }
    }
    
    function observeCardMutations(card) {
        if (!card) return;
        if (!cardMutationObserver) {
            cardMutationObserver = new MutationObserver(() => {
                if (isApplyingContent) {
                    return;
                }
                ensureCardDataAttributes(card);
                populatePersonalizedCardContent();
            });
        } else {
            cardMutationObserver.disconnect();
        }
        cardMutationObserver.observe(card, { childList: true, subtree: true });
    }
    
    function createPersonalizedCard() {
        // Only create if it doesn't exist
        let card = document.querySelector('.sc-iqPaeV.ijefWr');
        let createdNewCard = false;
        if (!card) {
            card = document.createElement('div');
            card.setAttribute('width', '320px');
            card.className = 'sc-iqPaeV ijefWr';
            card.setAttribute('aria-hidden', 'true');
            card.style.display = 'none';
            card.style.visibility = 'hidden';
            card.style.opacity = '0';
            card.style.pointerEvents = 'none';
            document.body.appendChild(card);
            createdNewCard = true;
        }
        // Ensure card is hidden by default (remove show class)
        card.classList.remove('show');
        card.style.display = 'none';
        card.style.visibility = 'hidden';
        card.style.opacity = '0';
        card.style.pointerEvents = 'none';
        if (createdNewCard) {
            // Update only the dynamic content of the personalized card
            card.innerHTML =
              '<div class="sc-eVspGN ekjela">Personalized Information</div>' +
              '<div class="sc-kSGOQU khoHKY" data-personalized-wrapper="true">' +
                '<div class="sc-dvEHMn iPExuY" data-personalized-row="user">' +
                  '<img data-personalized-avatar="true" height="32px" width="32px" src="" alt="' + userName + '" class="sc-eKJbhj bvTcOo" style="object-fit: cover; display: block; background-image: none !important; background: none !important;">' +
                  '<div class="sc-jsTgWu LACJw">' +
                    '<div class="sc-elAWhN jQgovu" data-personalized-username="true">' + userName + '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="sc-dvEHMn iPExuY" data-personalized-row="server">' +
                  '<img data-personalized-icon="true" height="32px" width="32px" src="" alt="' + communityName + '" class="sc-eKJbhj bvTcOo" style="object-fit: cover; display: block; background-image: none !important; background: none !important;">' +
                  '<div class="sc-jsTgWu LACJw">' +
                    '<div class="sc-elAWhN jQgovu" data-personalized-community="true">' + communityName + '</div>' +
                    '<div class="sc-kiPvrU iSxYDW" data-personalized-community-id="true">' + communityId + '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="sc-dvEHMn iPExuY" data-personalized-row="interaction">' +
                  '<svg width="32px" height="32px" viewBox="0 -28.5 256 256" version="1.1" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">' +
                    '<g><path d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z" fill="#5865F2" fill-rule="nonzero"></path></g>' +
                  '</svg>' +
                  '<div class="sc-jsTgWu LACJw">' +
                    '<div class="sc-elAWhN jQgovu">Interaction ID</div>' +
                    '<div class="sc-kiPvrU iSxYDW" data-personalized-interaction-id="true">' + interactionId + '</div>' +
                  '</div>' +
                '</div>' +
              '</div>';
        }
        ensureCardDataAttributes(card);
        observeCardMutations(card);
        populatePersonalizedCardContent();
        return card;
    }

    function populatePersonalizedCardContent() {
        const card = document.querySelector('.sc-iqPaeV.ijefWr');
        if (!card) return;
        ensureCardDataAttributes(card);
        isApplyingContent = true;
        card.style.display = 'none';
        card.style.visibility = 'hidden';
        card.style.opacity = '0';
        card.style.pointerEvents = 'none';
        const userImg = card.querySelector('img[data-personalized-avatar="true"]');
        if (userImg) {
            if (userAvatar) {
                const separator = userAvatar.includes('?') ? '&' : '?';
                const cacheSuffix = window.innerWidth <= 768 ? (separator + '_t=' + Date.now()) : '';
                userImg.src = userAvatar + cacheSuffix;
            }
            userImg.alt = userName || 'User avatar';
            userImg.onerror = (event) => {
                event.target.onerror = null;
                event.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png?size=128';
            };
        }
        const serverImg = card.querySelector('img[data-personalized-icon="true"]');
        if (serverImg) {
            if (serverIcon) {
                const separator = serverIcon.includes('?') ? '&' : '?';
                const cacheSuffix = window.innerWidth <= 768 ? (separator + '_t=' + Date.now()) : '';
                serverImg.src = serverIcon + cacheSuffix;
            } else {
                serverImg.src = fallbackServerIcon;
            }
            serverImg.alt = communityName || 'Server icon';
            serverImg.onerror = (event) => {
                event.target.onerror = null;
                event.target.src = fallbackServerIcon;
            };
        }
        const userNameNode = card.querySelector('[data-personalized-username="true"]');
        if (userNameNode) {
            userNameNode.textContent = userName || 'Unknown user';
        }
        const communityNameNode = card.querySelector('[data-personalized-community="true"]');
        if (communityNameNode) {
            communityNameNode.textContent = communityName || 'Server';
        }
        const communityIdNode = card.querySelector('[data-personalized-community-id="true"]');
        if (communityIdNode) {
            communityIdNode.textContent = communityId || '';
        }
        const interactionIdNode = card.querySelector('[data-personalized-interaction-id="true"]');
        if (interactionIdNode) {
            interactionIdNode.textContent = interactionId || '';
        }
        isApplyingContent = false;
        if (card.classList.contains('show')) {
            card.style.display = 'block';
            card.style.visibility = 'visible';
            card.style.opacity = '1';
            card.style.pointerEvents = 'auto';
        }
    }
    
    let statusIndicatorShouldStayHidden = false;

    function updateTopBarIcons() {
        // Only update the top right two icons, exclude personalized card images
        const personalizedCard = document.querySelector('.sc-iqPaeV.ijefWr');
        const images = document.querySelectorAll('img');
        let updatedUserAvatar = false;
        let updatedServerIcon = false;
        
        const imagesArray = Array.from(images);
        const topImages = imagesArray
            .map(img => {
                const rect = img.getBoundingClientRect();
                return { img, y: rect.top, x: rect.left, width: rect.width, height: rect.height };
            })
            .filter(item => {
                // Exclude images that are inside the personalized card
                if (personalizedCard && personalizedCard.contains(item.img)) {
                    return false;
                }
                // Only target top right area icons (top 200px, reasonable icon sizes)
                return item.y < 200 && item.width >= 20 && item.width <= 100 && item.height >= 20 && item.height <= 100;
            })
            .sort((a, b) => {
                // Sort by position: first by Y (top to bottom), then by X (left to right)
                // For top right icons, we want rightmost first, so reverse X sort
                if (Math.abs(a.y - b.y) < 10) return b.x - a.x; // Right to left for same row
                return a.y - b.y; // Top to bottom
            });
        
        // Create wrapper containers for both icons to enable hover on larger area
        if (topImages.length > 0 && !updatedUserAvatar) {
            const firstIcon = topImages[0];
            // Create or get wrapper container for first icon (user avatar)
            let container = firstIcon.img.closest('.avatar-hover-container');
            if (!container) {
                container = document.createElement('div');
                container.classList.add('avatar-hover-container');
                container.style.position = 'relative';
                container.style.display = 'inline-block';
                container.style.padding = '0';
                container.style.cursor = 'default';
                firstIcon.img.parentNode.insertBefore(container, firstIcon.img);
                container.appendChild(firstIcon.img);
            }
            firstIcon.img.src = userAvatar;
            firstIcon.img.style.objectFit = 'cover';
            firstIcon.img.style.borderRadius = '0';
            // Make sure user avatar doesn't have status indicator
            const userIndicator = container.querySelector('.status-indicator');
            if (userIndicator) {
                userIndicator.remove();
            }
            updatedUserAvatar = true;
        }
        
        if (topImages.length > 1 && !updatedServerIcon) {
            const secondIcon = topImages[1];
            // Create or get wrapper container for second icon (server avatar)
            let container = secondIcon.img.closest('.avatar-hover-container');
            if (!container) {
                container = document.createElement('div');
                container.classList.add('avatar-hover-container');
                container.style.position = 'relative';
                container.style.display = 'inline-block';
                container.style.padding = '0';
                container.style.cursor = 'default';
                secondIcon.img.parentNode.insertBefore(container, secondIcon.img);
                container.appendChild(secondIcon.img);
            }
            secondIcon.img.src = serverIcon;
            secondIcon.img.style.objectFit = 'cover';
            secondIcon.img.style.borderRadius = '0';
            
            // Add status indicator to server avatar (top-right corner)
            // Remove any existing indicator first to avoid duplicates
            const existingIndicator = container.querySelector('.status-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
            
            const statusIndicator = document.createElement('div');
            statusIndicator.className = 'status-indicator';
            statusIndicator.setAttribute('data-indicator', 'server-avatar');
            container.appendChild(statusIndicator);
            setStatusIndicatorVisibility(true);
            
            updatedServerIcon = true;
            console.log('✅ Added pulsing green status indicator to server avatar');
        }
    }

    function setStatusIndicatorVisibility(shouldShow) {
        const indicator = document.querySelector('.status-indicator[data-indicator="server-avatar"]');
        if (!indicator) {
            return;
        }
        if (statusIndicatorShouldStayHidden) {
            indicator.style.display = 'none';
            indicator.style.opacity = '0';
            return;
        }
        if (shouldShow) {
            indicator.style.removeProperty('display');
            indicator.style.opacity = '1';
        } else {
            indicator.style.display = 'none';
        }
    }

    function permanentlyHideStatusIndicator() {
        statusIndicatorShouldStayHidden = true;
        setStatusIndicatorVisibility(false);
    }
    
    function initHover() {
        const personalizedCard = document.querySelector('.sc-iqPaeV.ijefWr');
        if (!personalizedCard) return;
        
        // Find the target div with class sc-knEsKG bjrZaI
        const hoverTarget = document.querySelector('.sc-knEsKG.bjrZaI');
        
        if (hoverTarget) {
            // Use a data attribute to track if we've already added listeners
            if (!hoverTarget.dataset.hoverListenerAdded) {
                hoverTarget.dataset.hoverListenerAdded = 'true';
                
                hoverTarget.addEventListener('mouseenter', () => {
                    permanentlyHideStatusIndicator();
                    populatePersonalizedCardContent();
                    personalizedCard.classList.add('show');
                    personalizedCard.style.display = 'block';
                    personalizedCard.style.visibility = 'visible';
                    personalizedCard.style.opacity = '1';
                });
                
                hoverTarget.addEventListener('mouseleave', () => {
                    // Small delay to allow moving to card
                    setTimeout(() => {
                        if (!personalizedCard.matches(':hover') && !hoverTarget.matches(':hover')) {
                            personalizedCard.classList.remove('show');
                            personalizedCard.style.display = 'none';
                            personalizedCard.style.visibility = 'hidden';
                            personalizedCard.style.opacity = '0';
                            setStatusIndicatorVisibility(true);
                        }
                    }, 10);
                });
            }
        }
        
        // Also handle hover on the card itself to keep it visible
        personalizedCard.addEventListener('mouseenter', () => {
            permanentlyHideStatusIndicator();
            populatePersonalizedCardContent();
            personalizedCard.classList.add('show');
            personalizedCard.style.display = 'block';
            personalizedCard.style.visibility = 'visible';
            personalizedCard.style.opacity = '1';
        });
        personalizedCard.addEventListener('mouseleave', () => {
            personalizedCard.classList.remove('show');
            personalizedCard.style.display = 'none';
            personalizedCard.style.visibility = 'hidden';
            personalizedCard.style.opacity = '0';
        });
    }
    
    function hideCard() {
        const card = document.querySelector('.sc-iqPaeV.ijefWr');
        if (card) {
            card.classList.remove('show');
            card.style.display = 'none';
            card.style.visibility = 'hidden';
            card.style.opacity = '0';
            card.style.pointerEvents = 'none';
            setStatusIndicatorVisibility(true);
        }
    }
    
    function init() {
        if (expirationState.isExpired) {
            showExpirationOverlay();
            return;
        }
        if (!document.querySelector('.sc-iqPaeV.ijefWr')) {
            createPersonalizedCard();
        }
        // Always ensure card is hidden initially
        hideCard();
        populatePersonalizedCardContent();
        
        scheduleExpirationCheck();
        updateTopBarIcons();
        initHover();
        
        setTimeout(() => {
            updateTopBarIcons();
            initHover();
            hideCard();
        }, 500);
        
        setTimeout(() => {
            updateTopBarIcons();
            hideCard();
        }, 1000);
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
</script>`;
}

/**
 * Update HTML file to read from URL parameters instead of injected data
 */
async function updateHtmlToUseUrlParams(inputFile, outputFile) {
  try {
    console.log(`Reading ${inputFile}...`);
    let htmlContent = await fs.readFile(inputFile, "utf-8");

    // Remove any existing personalized content
    htmlContent = htmlContent.replace(
      /<style>[\s\S]*?\/\* Hide the personalized information div[\s\S]*?<\/style>/g,
      "",
    );
    htmlContent = htmlContent.replace(
      /<script>[\s\S]*?\/\* JavaScript for dynamic hover behavior[\s\S]*?<\/script>/g,
      "",
    );
    // Remove old scripts that reference personalizedDiv or sc-iqPaeV
    htmlContent = htmlContent.replace(
      /<script>[\s\S]*?document\.addEventListener\(['"]DOMContentLoaded['"][\s\S]*?personalizedDiv[\s\S]*?<\/script>/g,
      "",
    );
    // Also remove scripts in head that might reference the card
    htmlContent = htmlContent.replace(
      /<script>[\s\S]*?\.sc-iqPaeV[\s\S]*?<\/script>/g,
      "",
    );
    // Remove any script that tries to show/hide the card on load
    htmlContent = htmlContent.replace(
      /<script>[\s\S]*?querySelector\(['"]\.sc-iqPaeV\.ijefWr['"][\s\S]*?display['"][\s\S]*?<\/script>/g,
      "",
    );
    htmlContent = htmlContent.replace(
      /<div width="320px;" class="sc-iqPaeV ijefWr">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g,
      "",
    );

    const urlParamsScript = generateUrlParamsScript();

    if (htmlContent.includes("</body>")) {
      htmlContent = htmlContent.replace("</body>", `${urlParamsScript}\n</body>`);
    } else {
      htmlContent += urlParamsScript;
    }

    await fs.writeFile(outputFile, htmlContent, "utf-8");

    console.log(`✓ Successfully created ${outputFile} with URL parameter support`);

    return true;
  } catch (error) {
    console.error(`Error updating HTML: ${error.message}`);
    return false;
  }
}

module.exports = {
  generateDefaultServerIcon,
  generateCollabLandUrl,
  generatePersonalizedUrl,
  updateHtmlToUseUrlParams,
  generateUrlParamsScript,
  getCardStyleBlock,
};

