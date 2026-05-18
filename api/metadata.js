const blockedHosts = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$|\[?::1\]?)/i;

const isBlockedHost = (hostname) => {
  if (blockedHosts.test(hostname)) return true;
  const parts = hostname.split(".").map(Number);
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
};

const textBetween = (html, regex) => {
  const match = html.match(regex);
  return match?.[1]?.trim() || "";
};

const meta = (html, name) =>
  textBetween(
    html,
    new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
  ) ||
  textBetween(
    html,
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`, "i"),
  );

const clean = (value = "") =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");

  try {
    const target = new URL(req.query.url || "");
    if (!["http:", "https:"].includes(target.protocol) || isBlockedHost(target.hostname)) {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(target.href, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; DesignNotesBot/1.0)",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";
    if (contentType.startsWith("image/")) {
      res.json({
        description: "",
        hostname: target.hostname.replace(/^www\./, ""),
        image: target.href,
        siteName: target.hostname.replace(/^www\./, ""),
        title: target.href,
        url: target.href,
      });
      return;
    }

    const html = await response.text();
    const title = clean(meta(html, "og:title") || textBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
    const description = clean(meta(html, "og:description") || meta(html, "description"));
    const siteName = clean(meta(html, "og:site_name") || target.hostname.replace(/^www\./, ""));
    const imageValue = clean(meta(html, "og:image") || meta(html, "twitter:image"));
    const image = imageValue ? new URL(imageValue, target.href).href : "";

    res.json({
      description,
      hostname: target.hostname.replace(/^www\./, ""),
      image,
      siteName,
      title: title || target.href,
      url: target.href,
    });
  } catch {
    res.status(422).json({ error: "Unable to fetch metadata" });
  }
};
