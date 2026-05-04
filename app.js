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

const config = window.DESIGN_NOTES_SUPABASE || {};
const hasSupabaseConfig = Boolean(config.url && config.anonKey);
const adminEmails = (config.adminEmails || []).map((email) => email.toLowerCase());
const db =
  hasSupabaseConfig && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;

const isAdminEmail = (email) => adminEmails.includes(String(email || "").toLowerCase());

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatDate = (value) => {
  if (!value) return "";
  const [year, month] = value.split("-");
  return month ? `${year}. ${month}` : year;
};

const getPosts = async (category) => {
  if (!db) return { posts: [], error: "Supabase 설정이 필요합니다." };

  let query = db
    .from("posts")
    .select("id, category, type, date, title, summary, created_at")
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
      <em>${escapeHtml(post.type || post.category)}</em>
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

  const sections = ["problem", "evidence", "hypothesis", "solution", "result"]
    .filter((key) => post[key])
    .map(
      (key) => `
        <section class="post-section">
          <h2>${sectionLabels[key]}</h2>
          <p>${escapeHtml(post[key]).replaceAll("\n", "<br />")}</p>
        </section>
      `,
    )
    .join("");

  const backPage = categoryPages[post.category] || "index.html";
  document.title = `${post.title} · Design Notes`;
  target.innerHTML = `
    <header class="post-header">
      <p class="post-meta">${escapeHtml(post.type || post.category)} · ${escapeHtml(formatDate(post.date))}</p>
      <h1>${escapeHtml(post.title)}</h1>
      ${post.summary ? `<p>${escapeHtml(post.summary)}</p>` : ""}
    </header>
    ${sections || '<p class="empty-note">본문이 없습니다.</p>'}
    <a class="back-link" href="./${backPage}">Back</a>
  `;
};

const setAuthMessage = (message) => {
  const target = document.querySelector("[data-auth-message]");
  if (target) target.textContent = message || "";
};

const refreshAuthState = async () => {
  const authPanel = document.querySelector("[data-auth-panel]");
  const form = document.querySelector("[data-post-form]");
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
    return null;
  }

  if (authPanel) {
    authPanel.querySelector("[data-user-email]").textContent = email || "로그인 필요";
    authPanel.querySelector("[data-sign-out]").hidden = !session;
  }
  if (form) form.hidden = !isAdmin;
  return session;
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
    .select("id, category, type, date, title, created_at")
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
                <em>${escapeHtml(post.category)}</em>
              </a>
              <button type="button" data-delete-post="${escapeHtml(post.id)}">Delete</button>
            </li>
          `,
        )
        .join("")}
    </ol>
  `;

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
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 7);
  }

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
      type: data.get("type").trim(),
      date: data.get("date"),
      title: data.get("title").trim(),
      summary: data.get("summary").trim(),
      problem: data.get("problem").trim(),
      evidence: data.get("evidence").trim(),
      hypothesis: data.get("hypothesis").trim(),
      solution: data.get("solution").trim(),
      result: data.get("result").trim(),
      is_published: true,
    };

    const { error } = await db.from("posts").insert(post);
    if (error) {
      setAuthMessage(error.message);
      return;
    }

    form.reset();
    dateInput.value = new Date().toISOString().slice(0, 7);
    setAuthMessage("저장했습니다.");
    await renderAdminList();
  });
};

const init = async () => {
  await renderPostLists();
  await renderPostDetail();
  setupAuth();
  setupForm();
  await refreshAuthState();
  await renderAdminList();
};

init();
