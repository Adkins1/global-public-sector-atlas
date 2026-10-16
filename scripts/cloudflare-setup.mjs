/** Idempotent Pages setup. Credentials are read only from the environment. */
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const project = "global-public-sector-atlas";
const domain = "atlas.kawka.pro";
const mode = process.argv[2];
if (!token || !account || !["project", "domain"].includes(mode)) {
  throw new Error(
    "Set Cloudflare credentials and choose project or domain mode.",
  );
}
async function api(path, method = "GET", body, allowNotFound = false) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404 && allowNotFound) return null;
  const result = await response.json();
  // Never dump request headers, environment variables or arbitrary API responses.
  if (!response.ok || !result.success)
    throw new Error(
      `Cloudflare ${method} failed (HTTP ${response.status}; codes: ${(result.errors || []).map((e) => e.code).join(",")}).`,
    );
  return result.result;
}
const path = `accounts/${account}/pages/projects/${project}`;
let site = await api(path, "GET", undefined, true);
if (!site) {
  if (mode !== "project")
    throw new Error("Create and deploy the Pages project first.");
  site = await api(`accounts/${account}/pages/projects`, "POST", {
    name: project,
    production_branch: "main",
  });
}
if (mode === "domain") {
  const zones = await api("zones?name=kawka.pro");
  const zone = zones.find(
    (z) => z.name === "kawka.pro" && z.account.id === account,
  );
  if (!zone)
    throw new Error(
      "The domain zone is not available in the selected account.",
    );
  const records = await api(`zones/${zone.id}/dns_records?name=${domain}`);
  if (records.some((r) => r.type !== "CNAME" || r.content !== site.subdomain)) {
    throw new Error("Conflicting DNS record. No existing record was changed.");
  }
  const domains = await api(`${path}/domains`);
  if (!domains.some((d) => d.name === domain))
    await api(`${path}/domains`, "POST", { name: domain });
  // Register the domain with Pages before creating DNS, as required by Cloudflare.
  if (!records.length)
    await api(`zones/${zone.id}/dns_records`, "POST", {
      type: "CNAME",
      name: domain,
      content: site.subdomain,
      ttl: 1,
      proxied: true,
    });
  console.log(
    `Configured ${domain}. TLS/domain activation can take time; verify HTTPS before announcing it live.`,
  );
} else {
  console.log(`Pages project ready: ${site.name}`);
}
