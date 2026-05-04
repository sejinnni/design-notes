const STORAGE_KEY = "design-notes.posts";

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

const readPosts = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

const writePosts = (posts) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
};

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

const sortPosts = (posts) =>
  [...posts].sort((a, b) => {
    const byDate = String(b.date || "").localeCompare(String(a.date || ""));
    return byDate || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });

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

const renderPostLists = () => {
  document.querySelectorAll("[data-post-list]").forEach((target) => {
    const category = target.dataset.postList;
    const posts = sortPosts(readPosts()).filter((post) => post.category === category);

    if (!posts.length) {
      target.innerHTML = `<p class="empty-note">${escapeHtml(target.dataset.empty || "아직 글이 없습니다.")}</p>`;
      return;
    }

    target.innerHTML = `<ol class="index-list">${posts.map(listItem).join("")}</ol>`;
  });
};

const renderPostDetail = () => {
  const target = document.querySelector("[data-post-detail]");
  if (!target) return;

  const id = new URLSearchParams(window.location.search).get("id");
  const post = readPosts().find((item) => item.id === id);
  if (!post) return;

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

const renderAdminList = () => {
  const target = document.querySelector("[data-admin-list]");
  if (!target) return;

  const posts = sortPosts(readPosts());
  if (!posts.length) {
    target.innerHTML = '<p class="empty-note">저장한 글이 없습니다.</p>';
    return;
  }

  target.innerHTML = `
    <ol class="index-list admin-list">
      ${posts
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
    button.addEventListener("click", () => {
      const id = button.dataset.deletePost;
      writePosts(readPosts().filter((post) => post.id !== id));
      renderAdminList();
    });
  });
};

const setupForm = () => {
  const form = document.querySelector("[data-post-form]");
  if (!form) return;

  const dateInput = form.elements.date;
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 7);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const post = {
      id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()),
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
      createdAt: new Date().toISOString(),
    };

    writePosts([...readPosts(), post]);
    form.reset();
    dateInput.value = new Date().toISOString().slice(0, 7);
    renderAdminList();
  });
};

renderPostLists();
renderPostDetail();
setupForm();
renderAdminList();
