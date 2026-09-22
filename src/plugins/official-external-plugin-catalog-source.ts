// Pure catalog identities, source profiles, and feed validation shared by static and hosted readers.
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { uniqueStrings } from "@openclaw/normalization-core/string-normalization";
import { MANIFEST_KEY } from "../compat/legacy-names.js";
import type {
  OfficialExternalPluginCatalogEntry,
  OfficialExternalPluginCatalogManifest,
  OfficialExternalPluginCatalogInstallCandidate,
  OfficialExternalPluginCatalogFeed,
  OfficialExternalPluginCatalogFeedSigningKey,
  OfficialExternalPluginCatalogFeedVerification,
  OfficialExternalPluginCatalogProfileConfig,
} from "./official-external-plugin-catalog.types.js";

export class HostedCatalogSignedFeedMonotonicityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedCatalogSignedFeedMonotonicityError";
  }
}

const SUPPORTED_OFFICIAL_EXTERNAL_CATALOG_FEED_SCHEMA_VERSIONS = new Set([1, 2]);

const DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_FEED_PROFILE = "clawhub-public";

const DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_FEED_ID = "clawhub-official";

const DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_CLAWHUB_SOURCE_REF = "public-clawhub";

const DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_NPM_SOURCE_REF = "public-npm";

const DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_CLAWHUB_TRUSTED_KEYS: readonly OfficialExternalPluginCatalogFeedSigningKey[] =
  [];

/**
 * This build ships no hosted catalog feed, so the bundled catalog is the only
 * source until a default feed profile is added here for a server we run. The
 * ClawHub source names no host: it resolves to the operator-configured
 * registry (OPENCLAW_CLAWHUB_URL) and refuses when none is set.
 */
export const DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_PROFILE_CONFIG: OfficialExternalPluginCatalogProfileConfig =
  {
    feeds: {},
    sources: {
      [DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_CLAWHUB_SOURCE_REF]: { type: "clawhub" },
      [DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_NPM_SOURCE_REF]: {
        type: "npm",
        registry: "https://registry.npmjs.org/",
      },
    },
  };

const ISO_CALENDAR_DATE_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})/u;

export function parseOfficialExternalPluginCatalogTimestamp(value: string): number | undefined {
  const timestamp = value.trim();
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const calendarDate = ISO_CALENDAR_DATE_PREFIX_RE.exec(timestamp);
  if (!calendarDate) {
    return parsed;
  }
  const year = Number(calendarDate[1]);
  const month = Number(calendarDate[2]);
  const day = Number(calendarDate[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Shipped releases accepted every Date.parse-compatible serialization. Keep those
  // formats, but reject ISO-shaped impossible dates that Date.parse normalizes.
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]!
    ? parsed
    : undefined;
}

export function isOfficialExternalPluginCatalogSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isOfficialExternalPluginCatalogFeed(
  raw: unknown,
): raw is OfficialExternalPluginCatalogFeed {
  if (!isRecord(raw)) {
    return false;
  }
  const sequence = raw.sequence;
  const generatedAt = raw.generatedAt;
  const generatedAtMs =
    typeof generatedAt === "string"
      ? parseOfficialExternalPluginCatalogTimestamp(generatedAt)
      : undefined;
  const entries = raw.entries;
  return (
    typeof raw.schemaVersion === "number" &&
    SUPPORTED_OFFICIAL_EXTERNAL_CATALOG_FEED_SCHEMA_VERSIONS.has(raw.schemaVersion) &&
    typeof raw.id === "string" &&
    raw.id.trim().length > 0 &&
    typeof generatedAt === "string" &&
    generatedAt.trim().length > 0 &&
    generatedAtMs !== undefined &&
    isOfficialExternalPluginCatalogSequence(sequence) &&
    Array.isArray(entries)
  );
}

export function parseOfficialExternalPluginCatalogEntries(
  raw: unknown,
): OfficialExternalPluginCatalogEntry[] {
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is OfficialExternalPluginCatalogEntry => isRecord(entry));
  }
  if (isOfficialExternalPluginCatalogFeed(raw)) {
    return raw.entries.filter((entry): entry is OfficialExternalPluginCatalogEntry =>
      isRecord(entry),
    );
  }
  if (!isRecord(raw)) {
    return [];
  }
  if ("schemaVersion" in raw) {
    return [];
  }
  const list = raw.entries ?? raw.packages ?? raw.plugins;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((entry): entry is OfficialExternalPluginCatalogEntry => isRecord(entry));
}

export function resolveOfficialExternalPluginCatalogProfileConfig(
  config?: OfficialExternalPluginCatalogProfileConfig,
): Required<OfficialExternalPluginCatalogProfileConfig> {
  const configuredDefaultFeed =
    config?.feeds?.[DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_FEED_PROFILE];
  const bundledVerification =
    DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_CLAWHUB_TRUSTED_KEYS.length > 0
      ? {
          mode: "signed" as const,
          keys: DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_CLAWHUB_TRUSTED_KEYS,
        }
      : undefined;
  return {
    feeds: {
      ...config?.feeds,
      ...(configuredDefaultFeed
        ? {
            [DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_FEED_PROFILE]: {
              feedId: DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_FEED_ID,
              ...(bundledVerification ? { verification: bundledVerification } : {}),
              ...configuredDefaultFeed,
            },
          }
        : {}),
    },
    sources: {
      ...DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_PROFILE_CONFIG.sources,
      ...config?.sources,
    },
  };
}

export function getFeedEntryInstallCandidateRecords(
  entry: OfficialExternalPluginCatalogEntry,
): OfficialExternalPluginCatalogInstallCandidate[] {
  const install = isRecord(entry.install) ? entry.install : undefined;
  const candidates = install?.candidates;
  if (!Array.isArray(candidates)) {
    return [];
  }
  return candidates.filter(
    (candidate): candidate is OfficialExternalPluginCatalogInstallCandidate => isRecord(candidate),
  );
}

function getManifestInstallSourceRefCandidate(
  entry: OfficialExternalPluginCatalogEntry,
): OfficialExternalPluginCatalogInstallCandidate | undefined {
  const install = getOfficialExternalPluginCatalogManifest(entry)?.install;
  if (!install) {
    return undefined;
  }
  const hasInstallSpec = Boolean(
    normalizeOptionalString(install.clawhubSpec) ||
    normalizeOptionalString(install.npmSpec) ||
    normalizeOptionalString(install.localPath),
  );
  if (!hasInstallSpec) {
    return undefined;
  }
  return {
    sourceRef: normalizeOptionalString(install.sourceRef),
    package:
      normalizeOptionalString(install.npmSpec) ?? normalizeOptionalString(install.clawhubSpec),
  };
}

export function hasKnownCatalogSourceRef(
  candidate: OfficialExternalPluginCatalogInstallCandidate,
  sourceRefs: ReadonlySet<string>,
): boolean {
  const sourceRef = normalizeOptionalString(candidate.sourceRef);
  return Boolean(sourceRef && sourceRefs.has(sourceRef));
}

export function filterOfficialExternalPluginCatalogEntriesBySourceRefs(
  entries: OfficialExternalPluginCatalogEntry[],
  params?: {
    catalogConfig?: OfficialExternalPluginCatalogProfileConfig;
    requireManifestInstallSourceRef?: boolean;
  },
): OfficialExternalPluginCatalogEntry[] {
  let configuredSourceRefs: Set<string> | undefined;
  return entries.filter((entry) => {
    // One synchronous batch owns these configured facts; empty batches stay lazy.
    configuredSourceRefs ??= new Set(
      Object.keys(resolveOfficialExternalPluginCatalogProfileConfig(params?.catalogConfig).sources),
    );
    let candidates = getFeedEntryInstallCandidateRecords(entry);
    if (params?.requireManifestInstallSourceRef) {
      const manifestCandidate = getManifestInstallSourceRefCandidate(entry);
      if (manifestCandidate) {
        candidates = [...candidates, manifestCandidate];
      } else if (candidates.length === 0) {
        candidates = [{}];
      }
    }
    let valid = true;
    for (const candidate of candidates) {
      if (!hasKnownCatalogSourceRef(candidate, configuredSourceRefs)) {
        valid = false;
      }
    }
    return valid;
  });
}

// Generated source structure is stable; rows remain shared and must be read on each query.

export function dedupeOfficialExternalPluginCatalogEntries(
  entries: OfficialExternalPluginCatalogEntry[],
): OfficialExternalPluginCatalogEntry[] {
  const resolved = new Map<string, OfficialExternalPluginCatalogEntry>();
  for (const entry of entries) {
    const key = resolveOfficialExternalPluginCatalogEntryKey(entry);
    if (key && !resolved.has(key)) {
      resolved.set(key, entry);
    }
  }
  return [...resolved.values()];
}

export function resolveOfficialExternalPluginCatalogEntryKey(
  entry: OfficialExternalPluginCatalogEntry,
): string | undefined {
  const pluginId = resolveOfficialExternalPluginId(entry);
  if (pluginId) {
    return `${normalizeOptionalString(entry.kind) ?? "plugin"}:${pluginId}`;
  }
  const name = normalizeOptionalString(entry.name);
  if (name) {
    return name;
  }
  const id = normalizeOptionalString(entry.id);
  if (id) {
    return `${normalizeOptionalString(entry.kind) ?? normalizeOptionalString(entry.type) ?? "plugin"}:${id}`;
  }
  return undefined;
}

export function getOfficialExternalPluginCatalogManifest(
  entry: OfficialExternalPluginCatalogEntry,
): OfficialExternalPluginCatalogManifest | undefined {
  const manifest = entry[MANIFEST_KEY];
  return isRecord(manifest) ? manifest : undefined;
}

export function resolveOfficialExternalPluginId(
  entry: OfficialExternalPluginCatalogEntry,
): string | undefined {
  const manifest = getOfficialExternalPluginCatalogManifest(entry);
  return (
    normalizeOptionalString(manifest?.plugin?.id) ??
    normalizeOptionalString(manifest?.channel?.id) ??
    normalizeOptionalString(manifest?.providers?.[0]?.id) ??
    normalizeOptionalString(entry.id)
  );
}

const OFFICIAL_EXTERNAL_PLUGIN_CATALOG_FEED_HOSTNAME_ALLOWLIST: string[] = [];

function resolveHostedCatalogFeedUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("hosted catalog feed URL is invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("hosted catalog feed URL must use HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new Error("hosted catalog feed URL must not include credentials");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("hosted catalog feed URL must not include query strings or fragments");
  }
  return parsed;
}

export function resolveHostedCatalogFeedSource(params: {
  feedUrl?: string;
  feedProfile?: string;
  catalogConfig?: OfficialExternalPluginCatalogProfileConfig;
}): {
  url: URL;
  hostnameAllowlist: string[];
  expectedFeedId?: string;
  verification?: OfficialExternalPluginCatalogFeedVerification;
} {
  const explicitFeedUrl = normalizeOptionalString(params.feedUrl);
  const explicitProfileName = normalizeOptionalString(params.feedProfile);
  if (explicitFeedUrl) {
    const url = resolveHostedCatalogFeedUrl(explicitFeedUrl);
    const profileConfig = resolveOfficialExternalPluginCatalogProfileConfig(params.catalogConfig);
    // A direct URL may only target a host an operator already configured as a feed.
    const configuredHosts = Object.values(profileConfig.feeds).flatMap((feed) => {
      try {
        return [resolveHostedCatalogFeedUrl(feed.url).hostname];
      } catch {
        return [];
      }
    });
    const hostnameAllowlist = uniqueStrings([
      ...OFFICIAL_EXTERNAL_PLUGIN_CATALOG_FEED_HOSTNAME_ALLOWLIST,
      ...configuredHosts,
    ]);
    if (!hostnameAllowlist.includes(url.hostname)) {
      throw new Error("hosted catalog feed URL hostname is not allowed");
    }
    const profileName =
      explicitProfileName ??
      Object.entries(profileConfig.feeds).find(([, feed]) => {
        try {
          return resolveHostedCatalogFeedUrl(feed.url).href === url.href;
        } catch {
          return false;
        }
      })?.[0];
    const profile = profileName === undefined ? undefined : profileConfig.feeds[profileName];
    if (profileName !== undefined && !profile) {
      throw new Error(`hosted catalog feed profile "${profileName}" is not configured`);
    }
    return {
      url,
      hostnameAllowlist,
      ...(profile?.feedId ? { expectedFeedId: profile.feedId } : {}),
      ...(profile?.verification ? { verification: profile.verification } : {}),
    };
  }
  const profileName = explicitProfileName ?? DEFAULT_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_FEED_PROFILE;
  const profileConfig = resolveOfficialExternalPluginCatalogProfileConfig(params.catalogConfig);
  const profile = profileConfig.feeds[profileName];
  if (!profile) {
    throw new Error(`hosted catalog feed profile "${profileName}" is not configured`);
  }
  const url = resolveHostedCatalogFeedUrl(profile.url);
  return {
    url,
    hostnameAllowlist: uniqueStrings([
      ...OFFICIAL_EXTERNAL_PLUGIN_CATALOG_FEED_HOSTNAME_ALLOWLIST,
      url.hostname,
    ]),
    ...(profile.feedId ? { expectedFeedId: profile.feedId } : {}),
    verification: profile.verification,
  };
}

/**
 * Only the vendor's own default feed was exempt from install source refs; with
 * no default feed, every configured feed must name its install sources.
 */
export function shouldRequireManifestInstallSourceRef(_params: {
  feedUrl?: string;
  feedProfile?: string;
  catalogConfig?: OfficialExternalPluginCatalogProfileConfig;
}): boolean {
  return true;
}
