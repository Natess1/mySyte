(() => {
  "use strict";

  // ---------- Настройки ----------
  // Пароль администратора. Поменяйте на свой.
  const ADMIN_PASSWORD = "admin123";
  const STORE_KEY = "mysite-data-v1"; // локальный контент этого браузера
  const SHARED_CACHE_KEY = "mysite-shared-v1"; // копия общего контента на случай, если сайт недоступен
  const ROLE_KEY = "mysite-role";

  // Общий контент живёт в репозитории GitHub
  const CONTENT_PATH = "data/content.json";
  const GH_TOKEN_KEY = "mysite-gh-token";
  const GH_REPO_KEY = "mysite-gh-repo";
  const GH_BRANCH_KEY = "mysite-gh-branch";

  // Максимальный размер видеофайла:
  // при публикации на сайт — не больше 95 МБ (лимит GitHub — 100 МБ на файл),
  // без публикации — ограничение только памятью браузера
  const GH_MAX_MB = 95;
  const GH_MAX_BYTES = GH_MAX_MB * 1024 * 1024;
  const VIDEO_MAX_MB = 300;
  const VIDEO_MAX_BYTES = VIDEO_MAX_MB * 1024 * 1024;

  const SECTIONS = {
    home: { label: "Главная" },
    videos: {
      label: "Видео-уроки",
      itemName: "видео-урок",
      desc: "Видео-уроки — это обучающие ролики, в которых шаг за шагом показано, как что-то сделать. Смотрите их прямо на сайте в удобном темпе, ставьте на паузу и возвращайтесь к нужному уроку в любой момент.",
      empty:
        "Здесь появятся видео-уроки, как только администратор добавит первый.",
    },
    photos: {
      label: "Фото",
      itemName: "фото",
      desc: "Фото — галерея снимков: примеры работ, иллюстрации и интересные моменты. Нажмите на любую фотографию, чтобы открыть её на весь экран.",
      empty:
        "Здесь появится галерея, как только администратор добавит первые фотографии.",
    },
    articles: {
      label: "Статьи",
      itemName: "статью",
      desc: "Статьи — это подробные текстовые материалы: советы, разборы тем и полезные заметки. Читайте их в удобное время и в своём темпе.",
      empty:
        "Здесь появятся статьи, как только администратор опубликует первую.",
    },
  };

  const FIELDS = {
    home: [
      { k: "title", l: "Заголовок приветствия", t: "text" },
      { k: "text", l: "Текст приветствия", t: "textarea" },
    ],
    videos: [
      { k: "title", l: "Название урока", t: "text" },
      {
        k: "file",
        l: "Загрузить видео с устройства",
        t: "file",
        accept: "video/*",
        optional: true,
      },
      {
        k: "url",
        l: "или ссылка на видео (YouTube, Vimeo, прямая ссылка на .mp4)",
        t: "url",
        optional: true,
      },
      {
        k: "text",
        l: "Описание (необязательно)",
        t: "textarea",
        optional: true,
      },
    ],
    photos: [
      { k: "title", l: "Подпись (необязательно)", t: "text", optional: true },
      {
        k: "file",
        l: "Загрузить фото с устройства",
        t: "file",
        optional: true,
      },
      { k: "url", l: "или ссылка на фото", t: "url", optional: true },
    ],
    articles: [
      { k: "title", l: "Заголовок статьи", t: "text" },
      { k: "text", l: "Текст статьи", t: "textarea" },
    ],
  };

  const defaults = {
    home: {
      title: "Добро пожаловать!",
      text: "Рады видеть вас на нашем сайте.\nЗдесь вы найдёте полезные видео-уроки, красивые фотографии и интересные статьи.\nВыбирайте раздел в меню внизу экрана и приятного вам времяпрепровождения!",
    },
    videos: [],
    photos: [],
    articles: [
      {
        id: "demo1",
        title: "Первая статья",
        text: "Это пример статьи. Администратор может изменить или удалить её через кнопку «Редактирование» внизу страницы.",
      },
    ],
  };

  // ---------- Данные ----------
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY));
      if (d && d.home) return d;
    } catch (e) {
      /* ignore */
    }
    // Если своего контента нет — показываем последнюю известную общую версию
    try {
      const d = JSON.parse(localStorage.getItem(SHARED_CACHE_KEY));
      if (d && d.home) return d;
    } catch (e) {
      /* ignore */
    }
    return JSON.parse(JSON.stringify(defaults));
  }
  let data = load();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      alert(
        "Не удалось сохранить: хранилище браузера переполнено. Удалите часть фото.",
      );
      return false;
    }
  }

  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const $ = (s) => document.querySelector(s);
  const isAdmin = () => sessionStorage.getItem(ROLE_KEY) === "admin";

  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    kids
      .flat()
      .filter((x) => x != null && x !== false)
      .forEach((x) => e.append(x));
    return e;
  }

  const isHttp = (u) => /^https?:\/\//i.test(u);

  // ---------- Хранилище видеофайлов (IndexedDB) ----------
  // Видеофайлы большие, поэтому храним их не в localStorage, а в IndexedDB.
  // В localStorage остаются только название, описание и id файла.
  const VIDEO_DB = "mysite-videos";
  const VIDEO_STORE = "files";
  let dbPromise = null;

  function openVideoDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(VIDEO_DB, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(VIDEO_STORE))
            req.result.createObjectStore(VIDEO_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () =>
          reject(req.error || new Error("IndexedDB недоступна"));
      });
    }
    return dbPromise;
  }

  function idbPut(key, blob) {
    return openVideoDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(VIDEO_STORE, "readwrite");
          tx.objectStore(VIDEO_STORE).put(blob, key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error || new Error("Ошибка записи"));
          tx.onabort = () =>
            reject(tx.error || new Error("Хранилище переполнено"));
        }),
    );
  }

  function idbGet(key) {
    return openVideoDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const req = db
            .transaction(VIDEO_STORE, "readonly")
            .objectStore(VIDEO_STORE)
            .get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        }),
    );
  }

  function idbDelete(key) {
    openVideoDb()
      .then(
        (db) =>
          new Promise((resolve) => {
            const tx = db.transaction(VIDEO_STORE, "readwrite");
            tx.objectStore(VIDEO_STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          }),
      )
      .catch(() => {});
  }

  // Ссылки на blob-объекты — чтобы не создавать их заново при каждой перерисовке
  const blobUrls = new Map();

  function revokeBlobUrl(fileId) {
    if (blobUrls.has(fileId)) {
      URL.revokeObjectURL(blobUrls.get(fileId));
      blobUrls.delete(fileId);
    }
  }

  // Возвращает ссылку на видео: blob из IndexedDB либо запасную data-ссылку
  async function videoSource(item) {
    if (item.fileId) {
      if (blobUrls.has(item.fileId)) return blobUrls.get(item.fileId);
      try {
        const blob = await idbGet(item.fileId);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        blobUrls.set(item.fileId, url);
        return url;
      } catch (e) {
        return null;
      }
    }
    return item.src || null;
  }

  function localVideoEl(url) {
    return h("video", {
      src: url,
      controls: "",
      preload: "metadata",
      playsinline: "",
    });
  }

  // Видеофайл, выбранный в форме, но ещё не сохранённый
  let pendingVideoKey = null;

  function discardPendingVideo() {
    if (!pendingVideoKey) return;
    const used = data.videos.some((v) => v.fileId === pendingVideoKey);
    if (!used) {
      revokeBlobUrl(pendingVideoKey);
      idbDelete(pendingVideoKey);
    }
    pendingVideoKey = null;
  }

  // ---------- GitHub: общее хранилище для всех посетителей ----------
  // Контент лежит в самом репозитории: файл data/content.json и папки
  // data/photos и data/videos. Каждое сохранение в админке — это
  // отдельный коммит, поэтому вся история изменений видна в GitHub.
  // Токен хранится только в браузере администратора.

  function ghCfg() {
    return {
      token: localStorage.getItem(GH_TOKEN_KEY) || "",
      repo: localStorage.getItem(GH_REPO_KEY) || "",
      branch: localStorage.getItem(GH_BRANCH_KEY) || "main",
    };
  }

  const ghReady = () => {
    const c = ghCfg();
    return !!(c.token && c.repo);
  };

  const ghApiUrl = (path) =>
    "https://api.github.com/repos/" + ghCfg().repo + "/contents/" + path;

  function ghHeaders(extra) {
    return Object.assign(
      {
        Authorization: "Bearer " + ghCfg().token,
        Accept: "application/vnd.github+json",
      },
      extra || {},
    );
  }

  function ghErrText(status) {
    if (status === 401)
      return "токен неверный или устарел (401) — создайте новый и вставьте его в настройках GitHub";
    if (status === 403)
      return "нет права записи (403) — у токена должно быть разрешение Contents: Read and write";
    if (status === 404)
      return "репозиторий или ветка не найдены (404) — проверьте имя «владелец/репозиторий» и название ветки";
    return "GitHub ответил ошибкой " + status;
  }

  const b64ToBytes = (b64) =>
    Uint8Array.from(atob(String(b64).replace(/\s/g, "")), (c) =>
      c.charCodeAt(0),
    );

  function bytesToB64(bytes) {
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }

  // sha файла нужен при перезаписи; null — файла в репозитории ещё нет
  async function ghGetSha(path) {
    const c = ghCfg();
    const res = await fetch(
      ghApiUrl(path) + "?ref=" + encodeURIComponent(c.branch),
      {
        headers: ghHeaders({ Accept: "application/vnd.github.object" }),
        cache: "no-store",
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(ghErrText(res.status));
    const j = await res.json();
    return j.sha || null;
  }

  // Запись файла в репозиторий = коммит
  async function ghPutFile(path, bytes, message) {
    const body = {
      message: message,
      branch: ghCfg().branch,
      content: bytesToB64(bytes),
    };
    const sha = await ghGetSha(path);
    if (sha) body.sha = sha;
    const res = await fetch(ghApiUrl(path), {
      method: "PUT",
      headers: ghHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(ghErrText(res.status));
    const j = await res.json();
    return j.content && j.content.sha;
  }

  async function ghDeleteFile(path, message) {
    const sha = await ghGetSha(path);
    if (!sha) return;
    const res = await fetch(ghApiUrl(path), {
      method: "DELETE",
      headers: ghHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        message: message,
        branch: ghCfg().branch,
        sha: sha,
      }),
    });
    if (!res.ok) throw new Error(ghErrText(res.status));
  }

  async function ghUploadBlob(path, blob, message) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await ghPutFile(path, bytes, message);
  }

  // Общий контент через API — администратору, всегда свежая версия
  async function ghGetContent() {
    const c = ghCfg();
    const res = await fetch(
      ghApiUrl(CONTENT_PATH) + "?ref=" + encodeURIComponent(c.branch),
      { headers: ghHeaders(), cache: "no-store" },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(ghErrText(res.status));
    const j = await res.json();
    return {
      sha: j.sha,
      data: JSON.parse(new TextDecoder().decode(b64ToBytes(j.content))),
    };
  }

  // Публикации выстраиваются в очередь, чтобы коммиты не конфликтовали
  let ghChain = Promise.resolve();

  function syncRemote(message) {
    if (!ghReady()) return;
    ghChain = ghChain
      .then(() =>
        ghPutFile(
          CONTENT_PATH,
          new TextEncoder().encode(JSON.stringify(data, null, 2) + "\n"),
          message,
        ),
      )
      .catch((e) =>
        alert(
          "Изменения сохранены в вашем браузере, но опубликовать их не удалось: " +
            (e && e.message ? e.message : e),
        ),
      );
  }

  // Перенос контента из этого браузера в общий репозиторий.
  // Фото из встроенных картинок и видео до 95 МБ из IndexedDB
  // превращаются в файлы в репозитории.
  async function publishLocalContent() {
    let local = null;
    try {
      local = JSON.parse(localStorage.getItem(STORE_KEY));
    } catch (e) {
      /* ignore */
    }
    if (!local || !local.home) local = data;
    local.home = local.home || data.home;
    local.videos = local.videos || [];
    local.photos = local.photos || [];
    local.articles = local.articles || [];

    const problems = [];

    for (const p of local.photos) {
      if (!p.id) p.id = uid();
      if (p.src && p.src.startsWith("data:")) {
        try {
          const blob = await (await fetch(p.src)).blob();
          const path = "data/photos/" + p.id + ".jpg";
          await ghUploadBlob(path, blob, "Фото: " + (p.title || p.id));
          p.src = path;
        } catch (e) {
          problems.push(
            "фото «" + (p.title || p.id) + "»: " + (e.message || e),
          );
        }
      }
    }

    for (const v of local.videos) {
      if (!v.id) v.id = uid();
      if (v.fileId) {
        try {
          const blob = await idbGet(v.fileId);
          if (!blob) {
            problems.push(
              "видео «" +
                (v.title || v.id) +
                "»: файл не найден в этом браузере",
            );
            continue;
          }
          if (blob.size > GH_MAX_BYTES) {
            problems.push(
              "видео «" +
                (v.title || v.id) +
                "»: больше " +
                GH_MAX_MB +
                " МБ — осталось только в вашем браузере, добавьте его ссылкой",
            );
            continue;
          }
          const m = String(blob.type || "").match(/video\/(\w+)/);
          const path = "data/videos/" + v.id + "." + (m ? m[1] : "mp4");
          await ghUploadBlob(path, blob, "Видео: " + (v.title || v.id));
          delete v.fileId;
          delete v.url;
          v.src = path;
        } catch (e) {
          problems.push(
            "видео «" + (v.title || v.id) + "»: " + (e.message || e),
          );
        }
      }
    }

    data = local;
    save();
    render();
    await ghPutFile(
      CONTENT_PATH,
      new TextEncoder().encode(JSON.stringify(data, null, 2) + "\n"),
      "Перенос моего контента на сайт",
    );
    return problems;
  }

  // ---------- Экран выбора роли ----------
  const gate = $("#gate"),
    appEl = $("#app");
  const choice = $("#gate-choice"),
    adminForm = $("#gate-admin");
  const passInput = $("#admin-pass"),
    gateError = $("#gate-error");

  function enter(role) {
    sessionStorage.setItem(ROLE_KEY, role);
    gate.hidden = true;
    appEl.hidden = false;
    render();
  }

  $("#btn-user").addEventListener("click", () => enter("user"));
  $("#btn-admin").addEventListener("click", () => {
    choice.hidden = true;
    adminForm.hidden = false;
    gateError.hidden = true;
    passInput.value = "";
    passInput.focus();
  });
  $("#gate-back").addEventListener("click", () => {
    adminForm.hidden = true;
    choice.hidden = false;
  });
  adminForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (passInput.value === ADMIN_PASSWORD) {
      enter("admin");
    } else {
      gateError.hidden = false;
      passInput.select();
    }
  });

  // ---------- Шапка: мягко скрывается при прокрутке ----------
  const header = $("#header");
  function onScroll() {
    const y = window.scrollY;
    const o = Math.max(0, 1 - y / 140);
    header.style.opacity = o;
    header.style.transform = "translateY(" + -Math.min(y, 140) * 0.35 + "px)";
    header.style.pointerEvents = o < 0.05 ? "none" : "";
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // ---------- Видео ----------
  function videoEmbed(url) {
    let m = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/i,
    );
    if (m) {
      return h("iframe", {
        src: "https://www.youtube.com/embed/" + m[1],
        title: "Видео",
        allowfullscreen: "",
        loading: "lazy",
        allow:
          "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen",
      });
    }
    m = url.match(/vimeo\.com\/(\d+)/i);
    if (m) {
      return h("iframe", {
        src: "https://player.vimeo.com/video/" + m[1],
        title: "Видео",
        allowfullscreen: "",
        loading: "lazy",
      });
    }
    if (isHttp(url))
      return h("video", { src: url, controls: "", preload: "metadata" });
    return h("p", { class: "muted" }, "Некорректная ссылка на видео");
  }

  // ---------- Страницы ----------
  function paragraphs(text) {
    return String(text || "")
      .split(/\n+/)
      .filter(Boolean)
      .map((t) => h("p", null, t));
  }

  function pageHome() {
    return [
      h(
        "section",
        { class: "card hello" },
        h("h2", null, data.home.title),
        paragraphs(data.home.text),
      ),
    ];
  }

  function emptyBlock(section) {
    return h("div", { class: "empty" }, h("p", null, SECTIONS[section].empty));
  }

  function pageVideos() {
    if (!data.videos.length) return [emptyBlock("videos")];
    const cards = data.videos.map((v) => {
      const wrap = h("div", { class: "video-wrap" });
      let linked = false;
      if (v.url && isHttp(v.url)) {
        // Видео по ссылке (YouTube, VK, прямой .mp4)
        wrap.append(videoEmbed(v.url));
        linked = true;
      } else if (v.src) {
        // Видеофайл из репозитория сайта — доступен всем посетителям
        wrap.append(
          h("video", {
            src: v.src,
            controls: "",
            preload: "metadata",
            playsinline: "",
          }),
        );
      } else if (v.fileId) {
        // Локальный файл из памяти этого браузера
        wrap.append(h("p", { class: "video-note" }, "Загрузка видео…"));
        loadLocalVideo(wrap, v);
      } else {
        wrap.append(h("p", { class: "video-note" }, "Видео недоступно"));
      }
      return h(
        "article",
        { class: "card" },
        wrap,
        h("h3", null, v.title),
        paragraphs(v.text),
        // В конце карточки — ссылка на видео (только у видео по ссылке)
        linked
          ? h(
              "p",
              { class: "video-link" },
              h(
                "a",
                { href: v.url, target: "_blank", rel: "noopener noreferrer" },
                v.url,
              ),
            )
          : null,
      );
    });
    return [h("div", { class: "grid" }, cards)];
  }

  // Достаёт видеофайл из IndexedDB и подставляет его в карточку
  function loadLocalVideo(wrap, item) {
    videoSource(item)
      .then((url) => {
        if (!wrap.isConnected) return;
        wrap.replaceChildren(
          url
            ? localVideoEl(url)
            : h(
                "p",
                { class: "video-note" },
                "Видеофайл не найден в памяти браузера",
              ),
        );
      })
      .catch(() => {
        if (wrap.isConnected)
          wrap.replaceChildren(
            h("p", { class: "video-note" }, "Не удалось загрузить видео"),
          );
      });
  }

  function pagePhotos() {
    if (!data.photos.length) return [emptyBlock("photos")];
    return [
      h(
        "div",
        { class: "grid cols-3" },
        data.photos.map((p) =>
          h(
            "figure",
            { class: "card photo" },
            h("img", {
              src: p.src,
              alt: p.title || "Фото",
              loading: "lazy",
              onclick: () => openLightbox(p.src, p.title),
            }),
            p.title ? h("figcaption", null, p.title) : null,
          ),
        ),
      ),
    ];
  }

  // ---------- Статьи: свёрнутые карточки одного размера ----------
  // Раскрытые статьи запоминаются до перезагрузки страницы
  const expandedArticles = new Set();

  function articleCard(a) {
    const open = expandedArticles.has(a.id);
    const card = h("article", {
      class: "card article" + (open ? " open" : ""),
    });
    const toggle = h(
      "button",
      {
        class: "btn btn-small btn-outline article-toggle",
        type: "button",
        "aria-expanded": open ? "true" : "false",
        onclick: () => {
          if (open) expandedArticles.delete(a.id);
          else expandedArticles.add(a.id);
          // Перерисовываем только эту карточку, чтобы страница не прыгала вверх
          card.replaceWith(articleCard(a));
          measureArticleCards();
        },
      },
      open ? "Свернуть" : "Читать далее",
    );
    card.append(
      h("h3", null, a.title),
      h("div", { class: "article-body" }, paragraphs(a.text)),
      toggle,
    );
    return card;
  }

  function pageArticles() {
    if (!data.articles.length) return [emptyBlock("articles")];
    return data.articles.map(articleCard);
  }

  // Если текст целиком помещается в свёрнутую карточку —
  // прячем кнопку «Читать далее» и затемнение
  function measureArticleCards() {
    document
      .querySelectorAll("article.article:not(.open)")
      .forEach((card) => {
        const body = card.querySelector(".article-body");
        const btn = card.querySelector(".article-toggle");
        if (!body || !btn) return;
        const fits = body.scrollHeight <= body.clientHeight + 1;
        btn.hidden = fits;
        card.classList.toggle("no-overflow", fits);
      });
  }

  const PAGES = {
    home: pageHome,
    videos: pageVideos,
    photos: pagePhotos,
    articles: pageArticles,
  };

  function currentRoute() {
    const r = location.hash.replace("#", "");
    return SECTIONS[r] ? r : "home";
  }

  function render() {
    if (!sessionStorage.getItem(ROLE_KEY)) return;
    const route = currentRoute();
    const main = $("#main");

    // Шапка соответствует открытому разделу
    $(".site-title").textContent =
      route === "home" ? "Мой сайт" : SECTIONS[route].label;

    // filter(Boolean) обязателен: replaceChildren превратил бы null в текст «null»
    const kids = [
      route !== "home"
        ? h("h2", { class: "page-title" }, SECTIONS[route].label)
        : null,
      ...PAGES[route](),
      route !== "home"
        ? h("p", { class: "page-desc" }, SECTIONS[route].desc)
        : null,
      isAdmin()
        ? h(
            "div",
            { class: "admin-zone" },
            h(
              "button",
              {
                class: "btn btn-edit",
                type: "button",
                onclick: () => openEditor(route),
              },
              "+ Редактирование",
            ),
            h(
              "button",
              {
                class: "btn btn-outline btn-gh",
                type: "button",
                onclick: () => openGhSettings(),
              },
              "GitHub — публикация",
            ),
          )
        : null,
      h(
        "p",
        { class: "admin-zone muted" },
        h(
          "a",
          { href: "#home", onclick: logout, style: "color:inherit" },
          "Сменить роль / выйти",
        ),
      ),
    ].filter(Boolean);
    main.replaceChildren(...kids);
    measureArticleCards();
    document.querySelectorAll(".bottom-nav a").forEach((a) => {
      const on = a.dataset.route === route;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
    onScroll();
  }

  function logout(e) {
    e.preventDefault();
    sessionStorage.removeItem(ROLE_KEY);
    appEl.hidden = true;
    gate.hidden = false;
    adminForm.hidden = true;
    choice.hidden = false;
    $("#editor").close();
    const gh = $("#gh-settings");
    if (gh.open) gh.close();
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("resize", measureArticleCards);

  // ---------- Просмотр фото ----------
  const lightbox = $("#lightbox");
  function openLightbox(src, title) {
    $("#lightbox-img").src = src;
    $("#lightbox-img").alt = title || "Фото";
    lightbox.showModal();
  }
  lightbox.addEventListener("click", () => lightbox.close());

  // ---------- Редактор ----------
  const editor = $("#editor");

  // Окно закрывается ТОЛЬКО кнопкой «Закрыть»:
  // клик мимо окна и Esc не закрывают его.
  editor.addEventListener("cancel", (e) => e.preventDefault());

  // Видеофайл, выбранный в форму, но не сохранённый, удаляем из хранилища
  editor.addEventListener("close", discardPendingVideo);

  // Исходные значения полей — чтобы понять,
  // начал ли пользователь что-то вводить или менять
  let editorSectionKey = null;
  const editorInit = new Map();

  function editorIsDirty() {
    if (!editorSectionKey) return false;
    const form = $("#editor-form form");
    if (!form) return false;
    return FIELDS[editorSectionKey].some((f) => {
      const el = form.elements[f.k];
      if (!el) return false;
      if (f.t === "file") return el.files.length > 0;
      return el.value !== editorInit.get(f.k);
    });
  }

  $("#editor-close").addEventListener("click", () => {
    if (
      editorIsDirty() &&
      !confirm(
        "Вы действительно хотите закончить редактирование? Изменённые файлы не сохранятся.",
      )
    )
      return;
    editor.close();
  });

  function openEditor(section) {
    renderEditor(section, null);
    editor.showModal();
  }

  function renderEditor(section, editId) {
    discardPendingVideo();
    editorSectionKey = section;
    editorInit.clear();
    const isHome = section === "home";
    const items = isHome ? null : data[section];
    const editing = editId ? items.find((i) => i.id === editId) : null;
    const source = isHome ? data.home : editing || {};

    $("#editor-title").textContent =
      "Редактирование: " + SECTIONS[section].label;

    // форма
    const form = h("form", { novalidate: "" });
    form.append(
      h(
        "h3",
        { style: "margin-top:16px" },
        isHome
          ? "Текст приветствия"
          : editing
            ? "Изменить"
            : "Добавить " + SECTIONS[section].itemName,
      ),
    );

    FIELDS[section].forEach((f) => {
      const id = "f-" + f.k;
      form.append(h("label", { for: id }, f.l));
      let input;
      if (f.t === "textarea") {
        input = h("textarea", { id, name: f.k });
        input.value = source[f.k] || "";
      } else if (f.t === "file") {
        input = h("input", {
          id,
          name: f.k,
          type: "file",
          accept: f.accept || "image/*",
        });
      } else {
        input = h("input", { id, name: f.k, type: f.t });
        if (f.k === "url" && section === "photos")
          input.value = source.src && isHttp(source.src) ? source.src : "";
        else input.value = source[f.k] || "";
      }
      editorInit.set(f.k, f.t === "file" ? "" : input.value);
      form.append(input);
    });
    if (section === "photos" && editing) {
      form.append(
        h(
          "p",
          { class: "form-note" },
          "Чтобы заменить фото — выберите новый файл или вставьте ссылку. Иначе останется прежнее.",
        ),
      );
    }
    if (section === "videos") {
      form.append(
        h(
          "p",
          { class: "form-note" },
          editing
            ? "Чтобы заменить видео — выберите новый файл или вставьте ссылку. Иначе останется прежнее."
            : ghReady()
              ? "Выберите видеофайл (до 95 МБ — он попадёт в репозиторий, и его увидят все) или вставьте ссылку на видео."
              : "Выберите видеофайл на устройстве или вставьте ссылку. Пока GitHub не настроен, файл хранится только в этом браузере.",
        ),
      );
    }

    const err = h("p", { class: "error", hidden: "" });
    form.append(err);
    form.append(
      h(
        "div",
        { class: "form-actions" },
        h(
          "button",
          { class: "btn", type: "submit" },
          editing ? "Сохранить" : isHome ? "Сохранить" : "Добавить",
        ),
        editing
          ? h(
              "button",
              {
                class: "btn btn-outline",
                type: "button",
                onclick: () => renderEditor(section, null),
              },
              "Отмена",
            )
          : null,
      ),
    );

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      let msg = "";
      try {
        err.hidden = true;
        const fail = (m) => {
          err.textContent = m;
          err.hidden = false;
          return false;
        };
        const val = (k) =>
          form.elements[k] ? form.elements[k].value.trim() : "";

        if (section === "home") {
          if (!val("title")) return fail("Введите заголовок");
          data.home = { title: val("title"), text: val("text") };
          msg = "Обновление приветствия";
        } else if (section === "photos") {
          const itemId = editing ? editing.id : uid();
          const file = form.elements.file.files[0];
          let src = editing ? editing.src : "";
          let blob = null;
          if (file) {
            try {
              blob = await imageToBlob(file);
            } catch (x) {
              return fail("Не удалось прочитать изображение");
            }
          } else if (val("url")) {
            if (!isHttp(val("url")))
              return fail("Ссылка должна начинаться с http:// или https://");
            src = val("url");
          }
          if (!src && !blob) return fail("Выберите фото или вставьте ссылку");

          if (blob) {
            if (ghReady()) {
              // Фото уезжает в репозиторий — его увидят все посетители
              const path = "data/photos/" + itemId + ".jpg";
              try {
                await ghUploadBlob(
                  path,
                  blob,
                  (editing ? "Изменено фото: " : "Фото: ") +
                    (val("title") || itemId),
                );
              } catch (x) {
                return fail(
                  "Фото не загрузилось на GitHub: " + (x.message || x),
                );
              }
              src = path;
            } else {
              src = await blobToDataUrl(blob);
            }
          }

          const item = { id: itemId, title: val("title"), src: src };
          if (editing) items[items.indexOf(editing)] = item;
          else items.unshift(item);
          msg =
            (editing ? "Изменено фото: " : "Добавлено фото: ") +
            (val("title") || "без подписи");
        } else {
          if (!val("title")) return fail("Введите название");

          const itemId = editing ? editing.id : uid();
          const item = { id: itemId };

          if (section === "videos") {
            const url = val("url");
            if (url && !isHttp(url))
              return fail("Ссылка должна начинаться с http:// или https://");

            const file = form.elements.file
              ? form.elements.file.files[0]
              : null;
            const maxMb = ghReady() ? GH_MAX_MB : VIDEO_MAX_MB;
            let newKey = null; // ключ файла в IndexedDB (локальный режим)
            let newPath = null; // путь файла в репозитории (общий режим)
            if (file) {
              if (file.size > maxMb * 1024 * 1024)
                return fail(
                  "Видеофайл больше " +
                    maxMb +
                    " МБ — используйте ссылку на видео (YouTube, VK и т.п.).",
                );
              if (ghReady()) {
                const m = String(file.type || "").match(/video\/(\w+)/);
                newPath = "data/videos/" + itemId + "." + (m ? m[1] : "mp4");
                try {
                  await ghUploadBlob(
                    newPath,
                    file,
                    (editing ? "Изменено видео: " : "Видео: ") +
                      (val("title") || itemId),
                  );
                } catch (x) {
                  return fail(
                    "Видео не загрузилось на GitHub: " + (x.message || x),
                  );
                }
              } else {
                newKey = "v-" + uid();
                try {
                  await idbPut(newKey, file);
                  pendingVideoKey = newKey;
                } catch (x) {
                  return fail(
                    "Браузер не смог сохранить этот файл. Попробуйте видео поменьше или вставьте ссылку.",
                  );
                }
              }
            }

            // Приоритет: новый файл → ссылка → прежнее видео (при изменении)
            let fileId = null;
            let videoUrl = "";
            let videoPath = null;
            if (newPath) {
              videoPath = newPath;
            } else if (newKey) {
              fileId = newKey;
            } else if (url) {
              videoUrl = url;
            } else if (editing) {
              fileId = editing.fileId || null;
              videoUrl = editing.url || "";
              videoPath = editing.src || null;
            }
            if (!fileId && !videoUrl && !videoPath)
              return fail(
                "Выберите видеофайл с устройства или вставьте ссылку на видео",
              );

            // Старый локальный файл больше не нужен — удаляем его из хранилища
            if (editing && editing.fileId && editing.fileId !== fileId) {
              revokeBlobUrl(editing.fileId);
              idbDelete(editing.fileId);
            }

            item.title = val("title");
            item.text = val("text");
            if (fileId) item.fileId = fileId;
            if (videoUrl) item.url = videoUrl;
            if (videoPath) item.src = videoPath;
            msg =
              (editing ? "Изменено видео: " : "Добавлено видео: ") +
              (val("title") || itemId);
          } else {
            if (!val("text")) return fail("Введите текст");
            FIELDS[section].forEach((f) => {
              if (f.t !== "file") item[f.k] = val(f.k);
            });
            msg =
              (editing ? "Изменена статья: " : "Добавлена статья: ") +
              val("title");
          }

          if (editing) items[items.indexOf(editing)] = item;
          else items.unshift(item);
        }

        if (!save()) {
          data = load();
          return;
        }
        render();
        renderEditor(section, null);
        syncRemote(msg);
      } finally {
        submitBtn.disabled = false;
      }
    });

    $("#editor-form").replaceChildren(form);

    // список существующих
    const listTitle = $("#editor-list-title");
    const list = $("#editor-list");
    if (isHome) {
      listTitle.hidden = true;
      list.replaceChildren();
    } else {
      listTitle.hidden = false;
      list.replaceChildren(
        ...(items.length
          ? items.map((it) =>
              h(
                "div",
                { class: "list-item" },
                h(
                  "span",
                  null,
                  (it.title || "(без названия)") +
                    (section === "videos"
                      ? it.src
                        ? " · на сайте"
                        : it.fileId
                          ? " · файл"
                          : it.url
                            ? " · ссылка"
                            : ""
                      : ""),
                ),
                h(
                  "div",
                  { class: "row-actions" },
                  h(
                    "button",
                    {
                      class: "btn btn-small btn-outline",
                      type: "button",
                      onclick: () => {
                        renderEditor(section, it.id);
                        editor.scrollTo(0, 0);
                      },
                    },
                    "Изменить",
                  ),
                  h(
                    "button",
                    {
                      class: "btn btn-small btn-danger",
                      type: "button",
                      onclick: () => {
                        if (
                          !confirm(
                            "Удалить «" + (it.title || "элемент") + "»?",
                          )
                        )
                          return;
                        if (it.fileId) {
                          revokeBlobUrl(it.fileId);
                          idbDelete(it.fileId);
                        }
                        const mediaPath =
                          it.src && /^data\/(photos|videos)\//.test(it.src)
                            ? it.src
                            : null;
                        data[section] = data[section].filter(
                          (x) => x.id !== it.id,
                        );
                        save();
                        render();
                        renderEditor(section, null);
                        // Файл в репозитории тоже удаляем, чтобы не занимал место
                        if (ghReady() && mediaPath) {
                          ghChain = ghChain
                            .then(() =>
                              ghDeleteFile(
                                mediaPath,
                                "Удалено: " + (it.title || it.id),
                              ),
                            )
                            .catch(() => {});
                        }
                        syncRemote("Удалено: " + (it.title || "элемент"));
                      },
                    },
                    "Удалить",
                  ),
                ),
              ),
            )
          : [h("p", { class: "muted" }, "Пока ничего нет.")]),
      );
    }
  }

  // Уменьшаем фото, чтобы оно поместилось и в память браузера, и в репозиторий
  function imageToBlob(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const max = 1200;
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * k);
          c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("canvas"))),
            "image/jpeg",
            0.8,
          );
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = reject;
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  }

  // ---------- Настройки GitHub ----------
  const ghDialog = $("#gh-settings");
  const ghRepoInput = $("#gh-repo");
  const ghBranchInput = $("#gh-branch");
  const ghTokenInput = $("#gh-token");
  const ghStatus = $("#gh-status");
  const ghError = $("#gh-error");
  const ghPublishBtn = $("#gh-publish");

  function openGhSettings() {
    const c = ghCfg();
    ghRepoInput.value = c.repo;
    ghBranchInput.value = c.branch || "main";
    ghTokenInput.value = c.token;
    ghStatus.textContent = ghReady()
      ? "Подключено: " +
        c.repo +
        " (ветка " +
        (c.branch || "main") +
        "). Каждое сохранение в админке публикуется автоматически."
      : "GitHub пока не настроен: сайт видите только вы. Заполните поля ниже и нажмите «Сохранить настройки».";
    ghError.hidden = true;
    ghDialog.showModal();
  }

  ghDialog.addEventListener("cancel", (e) => e.preventDefault());
  $("#gh-close").addEventListener("click", () => ghDialog.close());

  $("#gh-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const repo = ghRepoInput.value
      .trim()
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\/+$/, "");
    const branch = ghBranchInput.value.trim() || "main";
    const token = ghTokenInput.value.trim();
    if (!repo || !repo.includes("/")) {
      ghError.textContent =
        "Укажите репозиторий в формате «владелец/репозиторий», например ivanov/mysite";
      ghError.hidden = false;
      return;
    }
    localStorage.setItem(GH_REPO_KEY, repo);
    localStorage.setItem(GH_BRANCH_KEY, branch);
    if (token) localStorage.setItem(GH_TOKEN_KEY, token);
    openGhSettings(); // обновляет строку статуса
  });

  ghPublishBtn.addEventListener("click", async () => {
    if (!ghReady()) {
      ghError.textContent =
        "Сначала заполните репозиторий и токен и нажмите «Сохранить настройки».";
      ghError.hidden = false;
      return;
    }
    if (
      !confirm(
        "Опубликовать на сайте весь ваш текущий контент? Общий вариант будет заменён вашим.",
      )
    )
      return;
    const old = ghPublishBtn.textContent;
    ghPublishBtn.disabled = true;
    ghPublishBtn.textContent = "Публикация…";
    try {
      const problems = await publishLocalContent();
      let msg =
        "Готово! Ваш контент опубликован в репозитории.\nНа сайте у всех посетителей он появится через 1–2 минуты.";
      if (problems.length)
        msg += "\n\nНе удалось перенести:\n- " + problems.join("\n- ");
      alert(msg);
      ghDialog.close();
    } catch (e) {
      ghError.textContent =
        "Опубликовать не удалось: " +
        (e && e.message ? e.message : e) +
        " Проверьте токен, имя репозитория и ветку.";
      ghError.hidden = false;
    } finally {
      ghPublishBtn.disabled = false;
      ghPublishBtn.textContent = old;
    }
  });

  // ---------- Старт ----------
  (async () => {
    const onHttp =
      location.protocol === "http:" || location.protocol === "https:";
    let localHasData = false;
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY));
      localHasData = !!(d && d.home);
    } catch (e) {
      localHasData = false;
    }

    // Общий контент для всех посетителей.
    // Администратору с настроенным GitHub — свежая версия прямо из репозитория,
    // остальным — файл data/content.json с сайта (если он там уже есть).
    let shared = null;
    if (isAdmin() && ghReady()) {
      try {
        const r = await ghGetContent();
        if (r && r.data && r.data.home) shared = r.data;
      } catch (e) {
        /* нет связи — работаем с локальной версией */
      }
    }
    if (!shared && onHttp && !localHasData) {
      try {
        const res = await fetch(CONTENT_PATH + "?t=" + Date.now(), {
          cache: "no-store",
        });
        if (res.ok) {
          const d = await res.json();
          if (d && d.home) shared = d;
        }
      } catch (e) {
        /* общего контента нет — работаем локально */
      }
    }
    if (shared) {
      data = shared;
      try {
        localStorage.setItem(SHARED_CACHE_KEY, JSON.stringify(shared));
      } catch (e) {
        /* переполнение — не страшно */
      }
    }

    if (sessionStorage.getItem(ROLE_KEY)) {
      gate.hidden = true;
      appEl.hidden = false;
      render();
    }
  })();
})();
