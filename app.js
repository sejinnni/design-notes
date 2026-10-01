const sectionLabels = {
  problem: "문제",
  evidence: "근거",
  hypothesis: "가설",
  solution: "해결",
  result: "결과",
};

const categoryPages = {
  build: "index.html",
  design: "design.html",
  etc: "etc.html",
};

const categoryLabels = {
  build: "index",
  design: "design",
  etc: "etc",
};

const config = window.DESIGN_NOTES_SUPABASE || {};
const hasSupabaseConfig = Boolean(config.url && config.anonKey);
const adminEmails = (config.adminEmails || []).map((email) => email.toLowerCase());
const db =
  hasSupabaseConfig && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
          storageKey: "design-notes.auth",
        },
      })
    : null;

const isAdminEmail = (email) => adminEmails.includes(String(email || "").toLowerCase());

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const decodeHtml = (value) => {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = String(value || "");
  return textarea.value.replace(/\s+/g, " ").trim();
};

const stripHtml = (value) => decodeHtml(String(value || "").replace(/<[^>]*>/g, " "));

const renderFormattedText = (value) =>
  escapeHtml(value)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
    .replace(/\+\+([^+\n]+)\+\+/g, "<u>$1</u>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[\[color:(red|blue|green|yellow)\]\]([\s\S]*?)\[\[\/color\]\]/g, '<span class="text-color-$1">$2</span>')
    .replaceAll("\n", "<br />");

const splitMarkdownRow = (line) => {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let cell = "";
  let escaped = false;

  for (const char of trimmed) {
    if (char === "|" && !escaped) {
      cells.push(cell.trim().replace(/\\\|/g, "|"));
      cell = "";
      continue;
    }

    if (escaped && char !== "|") cell += "\\";
    if (char === "\\" && !escaped) {
      escaped = true;
      continue;
    }

    cell += char;
    escaped = false;
  }

  cells.push(cell.trim().replace(/\\\|/g, "|"));
  return cells;
};

const isTableDivider = (line) =>
  splitMarkdownRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.trim()));

const renderMarkdownTable = (lines, start) => {
  if (!lines[start]?.includes("|") || !isTableDivider(lines[start + 1] || "")) return null;

  const header = splitMarkdownRow(lines[start]);
  const rows = [];
  let index = start + 2;

  while (index < lines.length && lines[index].trim().includes("|")) {
    rows.push(splitMarkdownRow(lines[index]));
    index += 1;
  }

  const renderCell = (cell, tag) => `<${tag}>${renderFormattedText(cell)}</${tag}>`;
  const columnCount = header.length;
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, cellIndex) => row[cellIndex] || ""),
  );

  return {
    html: `
      <div class="table-wrap">
        <table>
          <thead><tr>${header.map((cell) => renderCell(cell, "th")).join("")}</tr></thead>
          <tbody>${normalizedRows.map((row) => `<tr>${row.map((cell) => renderCell(cell, "td")).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
    `,
    nextIndex: index,
  };
};

const parseUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
};

const findFirstUrl = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !/^!\[[^\]]*\]\(https?:\/\/[^\s)]+\)$/.test(line))
    .join("\n")
    .match(/https?:\/\/[^\s<>"']+/)?.[0] || "";

const fetchWordpressMetadata = async (urlValue) => {
  const target = parseUrl(urlValue);
  const postId = target?.searchParams.get("p");
  if (!target || !postId || !/^\d+$/.test(postId)) return null;

  try {
    const endpoint = new URL(`/wp-json/wp/v2/posts/${postId}`, target.origin);
    const response = await fetch(endpoint.href);
    if (!response.ok) return null;

    const post = await response.json();
    const yoast = post.yoast_head_json || {};
    const image = yoast.og_image?.[0]?.url || "";

    return {
      description: stripHtml(yoast.og_description || yoast.description || post.excerpt?.rendered || ""),
      hostname: target.hostname.replace(/^www\./, ""),
      image,
      siteName: decodeHtml(yoast.og_site_name || target.hostname.replace(/^www\./, "")),
      title: stripHtml(yoast.og_title || yoast.title || post.title?.rendered || target.href),
      url: post.link || target.href,
    };
  } catch {
    return null;
  }
};

const fetchMetadata = async (url) => {
  const wordpressMetadata = await fetchWordpressMetadata(url);
  if (wordpressMetadata) return wordpressMetadata;

  const endpoint =
    config.metadataEndpoint ||
    (window.location.protocol === "file:"
      ? "https://design-notes-chi.vercel.app/api/metadata"
      : "/api/metadata");
  const separator = endpoint.includes("?") ? "&" : "?";
  const response = await fetch(`${endpoint}${separator}url=${encodeURIComponent(url)}&v=5`);
  if (!response.ok) throw new Error("링크 정보를 가져오지 못했습니다.");
  return response.json();
};

const getYoutubeEmbedUrl = (url) => {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
  if (!["youtube.com", "m.youtube.com"].includes(host)) return "";

  if (url.pathname === "/watch") return `https://www.youtube.com/embed/${url.searchParams.get("v") || ""}`;
  if (url.pathname.startsWith("/shorts/")) return `https://www.youtube.com/embed/${url.pathname.split("/")[2] || ""}`;
  if (url.pathname.startsWith("/embed/")) return url.href;
  return "";
};

const normalizeImageSize = (value) => {
  const size = String(value || "").trim().toLowerCase();
  const percent = size.match(/^(\d{1,3})%$/);
  if (percent) {
    const width = Number(percent[1]);
    return width >= 25 && width <= 100 ? `${width}%` : "";
  }

  const pixels = size.match(/^(\d{2,4})px$/);
  if (pixels) {
    const width = Number(pixels[1]);
    return width >= 120 && width <= 720 ? `${width}px` : "";
  }

  return "";
};

const IMAGE_CAPTION_PLACEHOLDER = "캡션 입력";

const normalizeImageCaption = (value) => {
  const caption = String(value || "").trim();
  return caption === IMAGE_CAPTION_PLACEHOLDER ? "" : caption;
};

const parseImageLabel = (value) => {
  const parts = String(value || "").split("|");
  const size = normalizeImageSize(parts[parts.length - 1]);
  if (!size) return { caption: normalizeImageCaption(value), size: "" };

  return {
    caption: normalizeImageCaption(parts.slice(0, -1).join("|")),
    size,
  };
};

const renderImageFigure = (url, caption = "", size = "") => `
  <figure class="image-figure"${size ? ` style="width: ${escapeHtml(size)};"` : ""}>
    <img class="embed-image" src="${escapeHtml(url.href)}" alt="${escapeHtml(caption)}" loading="lazy" />
    ${caption ? `<figcaption>${renderFormattedText(caption)}</figcaption>` : ""}
  </figure>
`;

const renderEmbed = (url) => {
  const youtubeUrl = getYoutubeEmbedUrl(url);
  if (youtubeUrl) {
    return `
      <div class="embed-block">
        <div class="embed-video">
          <iframe src="${escapeHtml(youtubeUrl)}" title="Embedded video" allowfullscreen loading="lazy"></iframe>
        </div>
      </div>
    `;
  }

  if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(url.pathname)) {
    return `<div class="embed-block">${renderImageFigure(url)}</div>`;
  }

  return `
    <div class="embed-block">
      <a class="embed-link" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer" data-embed-url="${escapeHtml(url.href)}">
        <span>${escapeHtml(url.hostname.replace(/^www\./, ""))}</span>
        <strong>${escapeHtml(url.href)}</strong>
      </a>
    </div>
  `;
};

const renderContent = (value) => {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let list = null;
  let quote = [];
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderFormattedText(paragraph.join("\n"))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const items = list.items
      .map((item) => {
        const task = item.match(/^\[( |x|X)\]\s+(.+)$/);
        if (!task) return `<li>${renderFormattedText(item)}</li>`;
        return `
          <li class="task-item">
            <input type="checkbox" disabled ${task[1].toLowerCase() === "x" ? "checked" : ""} />
            <span>${renderFormattedText(task[2])}</span>
          </li>
        `;
      })
      .join("");
    html.push(`<${list.type}>${items}</${list.type}>`);
    list = null;
  };

  const flushQuote = () => {
    if (!quote.length) return;
    html.push(`<blockquote><p>${renderFormattedText(quote.join("\n"))}</p></blockquote>`);
    quote = [];
  };

  const flushLooseBlocks = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (code) {
      if (trimmed.startsWith("```")) {
        html.push(`<pre><code>${escapeHtml(code.lines.join("\n"))}</code></pre>`);
        code = null;
      } else {
        code.lines.push(line);
      }
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushLooseBlocks();
      code = { lines: [] };
      continue;
    }

    if (!trimmed) {
      flushLooseBlocks();
      continue;
    }

    const table = renderMarkdownTable(lines, index);
    if (table) {
      flushLooseBlocks();
      html.push(table.html);
      index = table.nextIndex - 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s*(.+)$/);
    if (heading) {
      flushLooseBlocks();
      const level = heading[1].length;
      html.push(`<h${level}>${renderFormattedText(heading[2])}</h${level}>`);
      continue;
    }

    if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) {
      flushLooseBlocks();
      html.push("<hr />");
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quote.push(quoteMatch[1]);
      continue;
    }

    const listMatch = trimmed.match(/^([-*+])\s+(.+)$/) || trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      flushQuote();
      const isOrdered = /^\d+[.)]/.test(trimmed);
      const type = isOrdered ? "ol" : "ul";
      if (!list || list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push(listMatch[2] || listMatch[1]);
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/);
    if (imageMatch) {
      const url = parseUrl(imageMatch[2]);
      if (url) {
        const image = parseImageLabel(imageMatch[1]);
        flushLooseBlocks();
        html.push(`<div class="embed-block">${renderImageFigure(url, image.caption, image.size)}</div>`);
        continue;
      }
    }

    const url = parseUrl(trimmed);
    if (url && trimmed === line.trim()) {
      flushLooseBlocks();
      html.push(renderEmbed(url));
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  flushQuote();
  if (code) html.push(`<pre><code>${escapeHtml(code.lines.join("\n"))}</code></pre>`);
  return html.join("");
};

const renderMetadataCard = (metadata) => `
  <a class="embed-link has-preview" href="${escapeHtml(metadata.url)}" target="_blank" rel="noopener noreferrer">
    ${metadata.image ? `<img src="${escapeHtml(metadata.image)}" alt="" loading="lazy" />` : ""}
    <span>${escapeHtml(metadata.siteName || metadata.hostname || "")}</span>
    <strong>${escapeHtml(metadata.title || metadata.url)}</strong>
    ${metadata.description ? `<p>${escapeHtml(metadata.description)}</p>` : ""}
  </a>
`;

const hydrateEmbeds = async (root = document) => {
  const cards = root.querySelectorAll("[data-embed-url]");
  await Promise.all(
    [...cards].map(async (card) => {
      const url = card.dataset.embedUrl;
      if (!url || card.dataset.hydrated) return;
      card.dataset.hydrated = "true";

      try {
        const metadata = await fetchMetadata(url);
        card.outerHTML = renderMetadataCard(metadata);
      } catch {
        card.dataset.hydrated = "failed";
      }
    }),
  );
};

const formatDate = (value) => {
  if (!value) return "";
  const [year, month] = value.split("-");
  return month ? `${year}. ${month}` : year;
};

const getPosts = async (category) => {
  if (!db) return { posts: [], error: "Supabase 설정이 필요합니다." };

  let query = db
    .from("posts")
    .select("id, category, date, title, created_at")
    .eq("is_published", true)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  return { posts: data || [], error: error?.message || "" };
};

const getPost = async (id) => {
  if (!db) return { post: null, error: "Supabase 설정이 필요합니다." };

  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("id", id)
    .eq("is_published", true)
    .single();

  return { post: data, error: error?.message || "" };
};

const postUrl = (post) => `./post.html?id=${encodeURIComponent(post.id)}`;

const listItem = (post) => `
  <li>
    <a href="${postUrl(post)}">
      <span>${escapeHtml(formatDate(post.date))}</span>
      <strong>${escapeHtml(post.title)}</strong>
      <em>${escapeHtml(categoryLabels[post.category] || post.category)}</em>
    </a>
  </li>
`;

const renderPostLists = async () => {
  const targets = document.querySelectorAll("[data-post-list]");
  await Promise.all(
    [...targets].map(async (target) => {
      const category = target.dataset.postList;
      const { posts, error } = await getPosts(category);

      if (error && !hasSupabaseConfig) {
        target.innerHTML = '<p class="empty-note">Supabase 설정을 추가하면 글 목록이 표시됩니다.</p>';
        return;
      }

      if (error) {
        target.innerHTML = `<p class="empty-note">${escapeHtml(error)}</p>`;
        return;
      }

      if (!posts.length) {
        target.innerHTML = `<p class="empty-note">${escapeHtml(target.dataset.empty || "아직 글이 없습니다.")}</p>`;
        return;
      }

      target.innerHTML = `<ol class="index-list">${posts.map(listItem).join("")}</ol>`;
    }),
  );
};

const renderPostDetail = async () => {
  const target = document.querySelector("[data-post-detail]");
  if (!target) return;

  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return;

  const { post, error } = await getPost(id);
  if (error || !post) {
    target.innerHTML = `<p class="empty-note">${escapeHtml(error || "글을 찾을 수 없습니다.")}</p>`;
    return;
  }

  const sections = post.content
    ? `
        <section class="post-section">
          <div class="post-content">${renderContent(post.content)}</div>
        </section>
      `
    : ["problem", "evidence", "hypothesis", "solution", "result"]
    .filter((key) => post[key])
    .map(
      (key) => `
        <section class="post-section">
          <h2>${sectionLabels[key]}</h2>
          <p>${renderFormattedText(post[key])}</p>
        </section>
      `,
    )
    .join("");

  const backPage = categoryPages[post.category] || "index.html";
  document.title = `${post.title} · Design Notes`;
  target.innerHTML = `
    <header class="post-header">
      <p class="post-meta">${escapeHtml(categoryLabels[post.category] || post.category)} · ${escapeHtml(formatDate(post.date))}</p>
      <h1>${escapeHtml(post.title)}</h1>
      ${post.summary ? `<p>${escapeHtml(post.summary)}</p>` : ""}
    </header>
    ${post.image_url ? `<img class="post-image" src="${escapeHtml(post.image_url)}" alt="" />` : ""}
    ${sections || '<p class="empty-note">본문이 없습니다.</p>'}
    <a class="back-link" href="./${backPage}">Back</a>
  `;
  await hydrateEmbeds(target);
};

const setAuthMessage = (message) => {
  const target = document.querySelector("[data-auth-message]");
  if (target) target.textContent = message || "";
};

const refreshAuthState = async () => {
  const authSection = document.querySelector("[data-auth-section]");
  const authPanel = document.querySelector("[data-auth-panel]");
  const form = document.querySelector("[data-post-form]");
  const signInForm = document.querySelector("[data-sign-in-form]");
  if (!authPanel && !form) return null;

  if (!db) {
    setAuthMessage("supabase.config.js에 URL과 anon key를 입력해야 합니다.");
    if (form) form.hidden = true;
    return null;
  }

  const {
    data: { session },
  } = await db.auth.getSession();

  const email = session?.user?.email || "";
  const isAdmin = session && isAdminEmail(email);
  if (session && !isAdmin) {
    await db.auth.signOut();
    setAuthMessage("허용된 관리자 계정만 로그인할 수 있습니다.");
    if (authPanel) {
      authPanel.querySelector("[data-user-email]").textContent = "로그인 필요";
      authPanel.querySelector("[data-sign-out]").hidden = true;
    }
    if (form) form.hidden = true;
    if (authSection) authSection.hidden = false;
    return null;
  }

  if (authPanel) {
    authPanel.querySelector("[data-user-email]").textContent = email || "로그인 필요";
  }
  if (form) form.hidden = !isAdmin;
  if (signInForm) signInForm.hidden = Boolean(isAdmin);
  if (authSection) authSection.hidden = Boolean(isAdmin);
  document.querySelectorAll("[data-sign-out]").forEach((button) => {
    button.hidden = !isAdmin;
  });
  return session;
};

const loadPostIntoEditor = (post) => {
  const form = document.querySelector("[data-post-form]");
  if (!form) return;

  form.hidden = false;
  form.dataset.editingPostId = post.id;
  form.dataset.currentImageUrl = post.image_url || "";
  form.elements.category.value = post.category || "design";
  form.elements.date.value = post.date || new Date().toISOString().slice(0, 7);
  form.elements.title.value = post.title || "";
  form.elements.content.value =
    post.content ||
    [post.problem, post.evidence, post.hypothesis, post.solution, post.result]
      .filter(Boolean)
      .join("\n\n");
  form.elements.image.value = "";
  form.dispatchEvent(new Event("input", { bubbles: true }));

  const saveLabel = form.querySelector("[data-save-label]");
  if (saveLabel) saveLabel.textContent = "Update";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
};

const renderAdminList = async () => {
  const target = document.querySelector("[data-admin-list]");
  if (!target) return;

  if (!db) {
    target.innerHTML = '<p class="empty-note">Supabase 설정을 추가하면 저장한 글을 관리할 수 있습니다.</p>';
    return;
  }

  const {
    data: { session },
  } = await db.auth.getSession();
  if (!session || !isAdminEmail(session.user.email)) {
    target.innerHTML = '<p class="empty-note">로그인하면 저장한 글이 표시됩니다.</p>';
    return;
  }

  const { data, error } = await db
    .from("posts")
    .select("id, category, date, title, created_at")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    target.innerHTML = `<p class="empty-note">${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data.length) {
    target.innerHTML = '<p class="empty-note">저장한 글이 없습니다.</p>';
    return;
  }

  target.innerHTML = `
    <ol class="index-list admin-list">
      ${data
        .map(
          (post) => `
            <li>
              <a href="${postUrl(post)}">
                <span>${escapeHtml(formatDate(post.date))}</span>
                <strong>${escapeHtml(post.title)}</strong>
                <em>${escapeHtml(categoryLabels[post.category] || post.category)}</em>
              </a>
              <span class="admin-actions">
                <button type="button" data-edit-post="${escapeHtml(post.id)}">Edit</button>
                <button type="button" data-delete-post="${escapeHtml(post.id)}">Delete</button>
              </span>
            </li>
          `,
        )
        .join("")}
    </ol>
  `;

  target.querySelectorAll("[data-edit-post]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.editPost;
      const { post, error } = await getPost(id);
      if (error || !post) {
        setAuthMessage(error || "글을 불러오지 못했습니다.");
        return;
      }
      loadPostIntoEditor(post);
      setAuthMessage("수정할 글을 불러왔습니다.");
    });
  });

  target.querySelectorAll("[data-delete-post]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deletePost;
      const { error: deleteError } = await db.from("posts").delete().eq("id", id);
      if (deleteError) {
        setAuthMessage(deleteError.message);
        return;
      }
      await renderAdminList();
    });
  });
};

const setupAuth = () => {
  const signInForm = document.querySelector("[data-sign-in-form]");
  if (!signInForm) return;

  signInForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!db) return;

    const data = new FormData(signInForm);
    const email = data.get("email").trim();
    const password = data.get("password");
    const { error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    if (!isAdminEmail(email)) {
      await db.auth.signOut();
      setAuthMessage("허용된 관리자 계정만 로그인할 수 있습니다.");
      await refreshAuthState();
      await renderAdminList();
      return;
    }

    signInForm.reset();
    setAuthMessage("");
    await refreshAuthState();
    await renderAdminList();
  });

  document.querySelector("[data-sign-out]")?.addEventListener("click", async () => {
    if (!db) return;
    await db.auth.signOut();
    await refreshAuthState();
    await renderAdminList();
  });
};

const setupForm = () => {
  const form = document.querySelector("[data-post-form]");
  if (!form) return;

  const dateInput = form.elements.date;
  const saveLabel = form.querySelector("[data-save-label]");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 7);
  }

  const resetFormState = () => {
    delete form.dataset.editingPostId;
    delete form.dataset.currentImageUrl;
    if (saveLabel) saveLabel.textContent = "Save";
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 7);
  };

  const uploadPostImage = async (file, session) => {
    if (!file || !file.size) return "";

    const uploadFile = await convertImageForUpload(file);
    const extension = uploadFile.name.includes(".") ? uploadFile.name.split(".").pop().toLowerCase() : "jpg";
    const path = `${session.user.id}/${Date.now()}.${extension.replace(/[^a-z0-9]/g, "")}`;
    const { error } = await db.storage.from("post-images").upload(path, uploadFile, {
      cacheControl: "31536000",
      contentType: uploadFile.type || "image/jpeg",
      upsert: false,
    });

    if (error) throw error;

    const {
      data: { publicUrl },
    } = db.storage.from("post-images").getPublicUrl(path);

    return publicUrl;
  };

  const convertImageForUpload = async (file) => {
    const isHeic = /hei[cf]$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
    if (!isHeic) return file;

    if (!window.heic2any) {
      throw new Error("HEIC 이미지를 변환하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }

    const converted = await window.heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    const name = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  };

  const insertContentBlock = (textarea, value) => {
    if (!textarea || !value) return;

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n\n" : "\n";

    textarea.setRangeText(`${prefix}${value}${suffix}`, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  };

  form.elements.image?.addEventListener("change", async () => {
    const file = form.elements.image.files?.[0];
    if (!file || !db) return;

    const {
      data: { session },
    } = await db.auth.getSession();

    if (!session || !isAdminEmail(session.user.email)) {
      setAuthMessage("로그인 후 이미지를 삽입할 수 있습니다.");
      form.elements.image.value = "";
      return;
    }

    form.elements.image.disabled = true;
    setAuthMessage(/hei[cf]$/i.test(file.name) || /image\/hei[cf]/i.test(file.type) ? "HEIC 이미지를 변환 중..." : "이미지 업로드 중...");

    try {
      const imageUrl = await uploadPostImage(file, session);
      const imageSize = normalizeImageSize(form.elements.imageSize?.value) || "100%";
      insertContentBlock(form.elements.content, `![${IMAGE_CAPTION_PLACEHOLDER}|${imageSize}](${imageUrl})`);
      form.elements.image.value = "";
      setAuthMessage("이미지를 삽입했습니다.");
    } catch (error) {
      setAuthMessage(error.message);
    } finally {
      form.elements.image.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!db) return;

    const {
      data: { session },
    } = await db.auth.getSession();

    if (!session || !isAdminEmail(session.user.email)) {
      setAuthMessage("로그인 후 저장할 수 있습니다.");
      return;
    }

    const data = new FormData(form);

    const post = {
      category: data.get("category"),
      date: data.get("date"),
      title: data.get("title").trim(),
      content: data.get("content").trim(),
      image_url: form.dataset.currentImageUrl || "",
      is_published: true,
    };

    const editingPostId = form.dataset.editingPostId;
    const request = editingPostId
      ? db.from("posts").update(post).eq("id", editingPostId)
      : db.from("posts").insert(post);

    const { error } = await request;
    if (error) {
      setAuthMessage(error.message);
      return;
    }

    form.reset();
    dateInput.value = new Date().toISOString().slice(0, 7);
    resetFormState();
    setAuthMessage(editingPostId ? "수정했습니다." : "저장했습니다.");
    await renderAdminList();
  });

  form.addEventListener("reset", () => {
    window.setTimeout(resetFormState, 0);
  });
};

const setupFormatToolbar = () => {
  const textarea = document.querySelector('textarea[name="content"]');
  const toolbar = document.querySelector("[data-format-toolbar]");
  if (!textarea || !toolbar) return;

  const markers = {
    bold: ["**", "**"],
    italic: ["*", "*"],
    strike: ["~~", "~~"],
    underline: ["++", "++"],
    "heading-1": ["# ", ""],
    "heading-2": ["## ", ""],
    "heading-3": ["### ", ""],
    "color-red": ["[[color:red]]", "[[/color]]"],
    "color-blue": ["[[color:blue]]", "[[/color]]"],
    "color-green": ["[[color:green]]", "[[/color]]"],
    "color-yellow": ["[[color:yellow]]", "[[/color]]"],
  };

  const updateToolbar = () => {
    const hasSelection = textarea.selectionStart !== textarea.selectionEnd;
    const rect = textarea.getBoundingClientRect();
    toolbar.hidden = !hasSelection || document.activeElement !== textarea;

    if (!toolbar.hidden) {
      toolbar.style.left = `${Math.max(16, rect.left)}px`;
      toolbar.style.top = `${Math.max(16, rect.top - toolbar.offsetHeight - 10)}px`;
    }
  };

  const applyFormat = (type) => {
    const marker = markers[type];
    if (!marker) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    if (!selected) return;

    textarea.setRangeText(`${marker[0]}${selected}${marker[1]}`, start, end, "select");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
    updateToolbar();
  };

  toolbar.querySelectorAll("[data-format]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => applyFormat(button.dataset.format));
  });

  textarea.addEventListener("select", updateToolbar);
  textarea.addEventListener("keyup", updateToolbar);
  textarea.addEventListener("mouseup", updateToolbar);
  textarea.addEventListener("blur", () => {
    window.setTimeout(() => {
      toolbar.hidden = true;
    }, 120);
  });
  window.addEventListener("scroll", updateToolbar, { passive: true });
  window.addEventListener("resize", updateToolbar);
};

const tableCellToMarkdown = (value) =>
  String(value || "")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();

const rowsToMarkdownTable = (rows) => {
  const normalizedRows = rows
    .map((row) => row.map(tableCellToMarkdown))
    .filter((row) => row.some(Boolean));
  if (!normalizedRows.length) return "";

  const columnCount = Math.max(...normalizedRows.map((row) => row.length));
  const tableRows = normalizedRows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] || ""),
  );
  const [header, ...body] = tableRows;
  const divider = Array.from({ length: columnCount }, () => "---");
  const contentRows = body.length ? body : [Array.from({ length: columnCount }, () => "")];

  return [header, divider, ...contentRows].map((row) => `| ${row.join(" | ")} |`).join("\n");
};

const htmlTableToMarkdown = (html) => {
  if (!html || !html.includes("<table")) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return "";

  const rows = [...table.rows].map((row) => [...row.cells].map((cell) => cell.textContent || ""));
  return rowsToMarkdownTable(rows);
};

const tabTextToMarkdownTable = (text) => {
  const rows = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.split("\t"));

  if (rows.length < 2 || rows.some((row) => row.length < 2)) return "";
  return rowsToMarkdownTable(rows);
};

const setupMarkdownPaste = () => {
  const textarea = document.querySelector('textarea[name="content"]');
  if (!textarea) return;

  textarea.addEventListener("paste", (event) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;

    const markdownTable =
      htmlTableToMarkdown(clipboard.getData("text/html")) ||
      tabTextToMarkdownTable(clipboard.getData("text/plain"));
    if (!markdownTable) return;

    event.preventDefault();

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const prefix = start > 0 && textarea.value[start - 1] !== "\n" ? "\n\n" : "";
    const suffix = textarea.value[end] && textarea.value[end] !== "\n" ? "\n\n" : "";
    textarea.setRangeText(`${prefix}${markdownTable}${suffix}`, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const setupLinkPreview = () => {
  const textarea = document.querySelector('textarea[name="content"]');
  const preview = document.querySelector("[data-link-preview]");
  if (!textarea || !preview) return;

  let lastUrl = "";
  let timer = 0;

  const renderPreview = async () => {
    const urlValue = findFirstUrl(textarea.value);
    if (!urlValue) {
      lastUrl = "";
      preview.hidden = true;
      preview.innerHTML = "";
      return;
    }

    if (urlValue === lastUrl) return;
    lastUrl = urlValue;

    const url = parseUrl(urlValue);
    if (!url) return;

    preview.hidden = false;
    preview.innerHTML = renderEmbed(url);

    const genericCard = preview.querySelector("[data-embed-url]");
    if (genericCard) {
      try {
        const metadata = await fetchMetadata(url.href);
        preview.innerHTML = `<div class="embed-block">${renderMetadataCard(metadata)}</div>`;
      } catch {
        preview.innerHTML = renderEmbed(url);
      }
    }
  };

  textarea.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(renderPreview, 300);
  });
};

const setupEditorPreview = () => {
  const form = document.querySelector("[data-post-form]");
  const titleTarget = document.querySelector("[data-preview-title]");
  const metaTarget = document.querySelector("[data-preview-meta]");
  const contentTarget = document.querySelector("[data-preview-content]");
  if (!form || !titleTarget || !metaTarget || !contentTarget) return;

  let timer = 0;
  let renderId = 0;

  const renderPreview = async () => {
    const currentRenderId = (renderId += 1);
    const title = form.elements.title?.value.trim() || "Untitled";
    const category = form.elements.category?.value || "build";
    const date = form.elements.date?.value || new Date().toISOString().slice(0, 7);
    const content = form.elements.content?.value || "";

    titleTarget.textContent = title;
    metaTarget.textContent = `${categoryLabels[category] || category} · ${formatDate(date)}`;
    contentTarget.innerHTML = content.trim()
      ? renderContent(content)
      : '<p class="empty-note">본문 미리보기</p>';

    await hydrateEmbeds(contentTarget);
    if (currentRenderId !== renderId) return;
  };

  const schedulePreview = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(renderPreview, 250);
  };

  form.addEventListener("input", schedulePreview);
  form.addEventListener("change", schedulePreview);
  form.addEventListener("reset", () => {
    window.setTimeout(renderPreview, 0);
  });
  renderPreview();
};

const init = async () => {
  await renderPostLists();
  await renderPostDetail();
  setupAuth();
  setupForm();
  setupFormatToolbar();
  setupMarkdownPaste();
  setupLinkPreview();
  setupEditorPreview();
  await refreshAuthState();
  await renderAdminList();
};

init();
