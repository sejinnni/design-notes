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

const attrs = (tag) => {
  const result = {};
  tag.replace(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g, (_, key, __, value) => {
    result[key.toLowerCase()] = value;
    return "";
  });
  return result;
};

const meta = (html, name) => {
  const target = name.toLowerCase();
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const values = attrs(tag);
    const key = (values.property || values.name || "").toLowerCase();
    if (key === target && values.content) return values.content;
  }
  return "";
};

const firstJsonLd = (html) => {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const script of scripts) {
    const raw = textBetween(script, /<script[^>]*>([\s\S]*?)<\/script>/i);
    try {
      const data = JSON.parse(raw);
      const graph = Array.isArray(data["@graph"]) ? data["@graph"] : [data];
      const article =
        graph.find((item) => ["NewsArticle", "Article", "BlogPosting"].includes(item["@type"])) ||
        graph.find((item) => item.headline || item.name);
      if (article) return article;
    } catch {
      continue;
    }
  }
  return {};
};

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
    const jsonLd = firstJsonLd(html);
    const jsonImage = Array.isArray(jsonLd.image) ? jsonLd.image[0] : jsonLd.image?.url || jsonLd.thumbnailUrl || jsonLd.image;
    const title = clean(
      meta(html, "og:title") ||
        meta(html, "twitter:title") ||
        jsonLd.headline ||
        jsonLd.name ||
        textBetween(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
        textBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    );
    const description = clean(
      meta(html, "og:description") ||
        meta(html, "twitter:description") ||
        meta(html, "description") ||
        jsonLd.description,
    );
    const siteName = clean(meta(html, "og:site_name") || target.hostname.replace(/^www\./, ""));
    const imageValue = clean(meta(html, "og:image") || meta(html, "twitter:image") || jsonImage);
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
