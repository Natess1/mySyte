(() => {
  "use strict";

  // ---------- Настройки ----------
  // Пароль администратора. Поменяйте на свой.
  const ADMIN_PASSWORD = "admin123";
  const STORE_KEY = "mysite-data-v1";
  const ROLE_KEY = "mysite-role";

  // Максимальный размер видеофайла, загружаемого с устройства
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
      if (v.url && isHttp(v.url)) {
        wrap.append(videoEmbed(v.url));
      } else {
        wrap.append(h("p", { class: "video-note" }, "Загрузка видео…"));
        loadLocalVideo(wrap, v);
      }
      return h(
        "article",
        { class: "card" },
        wrap,
        h("h3", null, v.title),
        paragraphs(v.text),
        // В конце карточки — ссылка на видео (кроме локальных файлов)
        v.url && isHttp(v.url)
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
                class: "btn",
                type: "button",
                onclick: () => openEditor(route),
              },
              "+ Редактирование",
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
            : "Выберите видеофайл на устройстве или вставьте ссылку. Файл хранится в этом браузере.",
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
      err.hidden = true;
      const fail = (msg) => {
        err.textContent = msg;
        err.hidden = false;
      };
      const val = (k) =>
        form.elements[k] ? form.elements[k].value.trim() : "";

      if (section === "home") {
        if (!val("title")) return fail("Введите заголовок");
        data.home = { title: val("title"), text: val("text") };
      } else if (section === "photos") {
        const file = form.elements.file.files[0];
        let src = editing ? editing.src : "";
        if (file) {
          try {
            src = await imageToDataUrl(file);
          } catch (x) {
            return fail("Не удалось прочитать изображение");
          }
        } else if (val("url")) {
          if (!isHttp(val("url")))
            return fail("Ссылка должна начинаться с http:// или https://");
          src = val("url");
        }
        if (!src) return fail("Выберите фото или вставьте ссылку");
        const item = {
          id: editing ? editing.id : uid(),
          title: val("title"),
          src,
        };
        if (editing) items[items.indexOf(editing)] = item;
        else items.unshift(item);
      } else {
        if (!val("title")) return fail("Введите название");

        const item = { id: editing ? editing.id : uid() };

        if (section === "videos") {
          const url = val("url");
          if (url && !isHttp(url))
            return fail("Ссылка должна начинаться с http:// или https://");

          const file = form.elements.file
            ? form.elements.file.files[0]
            : null;
          let newKey = null;
          if (file) {
            if (file.size > VIDEO_MAX_BYTES)
              return fail(
                "Видеофайл больше " +
                  VIDEO_MAX_MB +
                  " МБ — используйте ссылку на видео.",
              );
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

          // Приоритет: новый файл → ссылка → прежнее видео (при изменении)
          let fileId = null;
          let videoUrl = "";
          if (newKey) {
            fileId = newKey;
          } else if (url) {
            videoUrl = url;
          } else if (editing) {
            fileId = editing.fileId || null;
            videoUrl = editing.url || "";
          }
          if (!fileId && !videoUrl)
            return fail(
              "Выберите видеофайл с устройства или вставьте ссылку на видео",
            );

          // Старый файл больше не нужен — удаляем его из хранилища
          if (editing && editing.fileId && editing.fileId !== fileId) {
            revokeBlobUrl(editing.fileId);
            idbDelete(editing.fileId);
          }

          item.title = val("title");
          item.text = val("text");
          if (fileId) item.fileId = fileId;
          if (videoUrl) item.url = videoUrl;
        } else {
          if (!val("text")) return fail("Введите текст");
          FIELDS[section].forEach((f) => {
            if (f.t !== "file") item[f.k] = val(f.k);
          });
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
                      ? it.fileId
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
                          !confirm("Удалить «" + (it.title || "элемент") + "»?")
                        )
                          return;
                        if (it.fileId) {
                          revokeBlobUrl(it.fileId);
                          idbDelete(it.fileId);
                        }
                        data[section] = data[section].filter(
                          (x) => x.id !== it.id,
                        );
                        save();
                        render();
                        renderEditor(section, null);
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

  // Уменьшаем фото, чтобы оно поместилось в память браузера
  function imageToDataUrl(file) {
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
          resolve(c.toDataURL("image/jpeg", 0.8));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- Старт ----------
  if (sessionStorage.getItem(ROLE_KEY)) {
    gate.hidden = true;
    appEl.hidden = false;
    render();
  }
})();
