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

const renderFormattedText = (value) =>
  escapeHtml(value)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
    .replace(/\+\+([^+\n]+)\+\+/g, "<u>$1</u>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replaceAll("\n", "<br />");

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
          <p>${renderFormattedText(post.content)}</p>
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

    const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "jpg";
    const path = `${session.user.id}/${Date.now()}.${extension.replace(/[^a-z0-9]/g, "")}`;
    const { error } = await db.storage.from("post-images").upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

    if (error) throw error;

    const {
      data: { publicUrl },
    } = db.storage.from("post-images").getPublicUrl(path);

    return publicUrl;
  };

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
    let imageUrl = form.dataset.currentImageUrl || "";

    try {
      imageUrl = (await uploadPostImage(data.get("image"), session)) || imageUrl;
    } catch (error) {
      setAuthMessage(error.message);
      return;
    }

    const post = {
      category: data.get("category"),
      date: data.get("date"),
      title: data.get("title").trim(),
      content: data.get("content").trim(),
      image_url: imageUrl,
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

const init = async () => {
  await renderPostLists();
  await renderPostDetail();
  setupAuth();
  setupForm();
  setupFormatToolbar();
  await refreshAuthState();
  await renderAdminList();
};

init();
