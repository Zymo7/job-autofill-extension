(function installResumeAutofillPanel() {
  "use strict";

  const INSTANCE_KEY = "__resumeAutofillPanelV1__";
  if (window[INSTANCE_KEY]) {
    return;
  }

  const BLOCKED_INPUT_TYPES = new Set(["password", "file", "hidden", "button", "submit", "reset", "image", "checkbox", "radio", "range", "color"]);
  const SUPPORTED_INPUT_TYPES = new Set(["text", "email", "tel", "number", "date", "month", "url", "search"]);
  const DANGEROUS_TERMS = [
    "captcha", "verificationcode", "verifycode", "otp", "onetimepassword",
    "creditcard", "debitcard", "bankcard", "cardnumber", "cvv", "cvc",
    "payment", "paycode", "验证码", "短信码", "动态码", "银行卡",
    "信用卡", "借记卡", "卡号", "安全码", "支付密码"
  ];
  const FIELD_MATCHERS = [
    { key: "name", aliases: ["姓名", "名字", "中文名", "英文名", "name", "full name", "real name", "candidate name", "applicant name"] },
    { key: "gender", aliases: ["性别", "gender", "sex"] },
    { key: "birthDate", aliases: ["出生日期", "出生年月", "生日", "birth date", "birthday", "date of birth", "dob", "bday"] },
    { key: "phone", aliases: ["手机号", "手机号码", "联系电话", "电话", "phone", "phone number", "mobile", "mobile phone", "telephone", "tel"] },
    { key: "email", aliases: ["邮箱", "电子邮箱", "电子邮件", "email", "e-mail", "mail address", "email address"] },
    { key: "idCard", aliases: ["身份证号", "身份证号码", "证件号码", "id card", "identity card", "identity number", "citizen id"] },
    { key: "ethnicity", aliases: ["民族", "ethnicity", "ethnic group"] },
    { key: "politicalStatus", aliases: ["政治面貌", "政治身份", "political status"] },
    { key: "nativePlace", aliases: ["籍贯", "生源地", "native place", "place of origin"] },
    { key: "currentCity", aliases: ["现居住地", "现居城市", "居住地", "当前城市", "current city", "residence city", "living city"] },
    { key: "address", aliases: ["详细地址", "通讯地址", "联系地址", "居住地址", "address", "street address", "mailing address"] },
    { key: "school", aliases: ["学校", "院校", "毕业院校", "就读学校", "school", "university", "graduate school"] },
    { key: "college", aliases: ["学院", "院系", "系别", "college", "faculty", "department"] },
    { key: "major", aliases: ["专业", "所学专业", "major", "specialization", "field of study"] },
    { key: "education", aliases: ["学历", "最高学历", "education", "education level", "qualification"] },
    { key: "degree", aliases: ["学位", "degree", "academic degree"] },
    { key: "enrollmentDate", aliases: ["入学时间", "入学日期", "入学年月", "enrollment date", "admission date", "matriculation date"] },
    { key: "graduationDate", aliases: ["毕业时间", "毕业日期", "毕业年月", "graduation date", "graduate date"] },
    { key: "gpa", aliases: ["gpa", "绩点", "平均绩点", "grade point average"] },
    { key: "rank", aliases: ["专业排名", "成绩排名", "排名", "major rank", "academic rank"] },
    { key: "jobDirection", aliases: ["求职方向", "意向方向", "职业方向", "job direction", "career direction"] },
    { key: "expectedCity", aliases: ["期望城市", "意向城市", "工作地点", "期望工作地", "expected city", "preferred city", "work location"] },
    { key: "expectedPosition", aliases: ["期望岗位", "意向岗位", "应聘岗位", "目标职位", "expected position", "preferred position", "job position", "job title"] },
    { key: "availableDate", aliases: ["可入职时间", "到岗时间", "入职时间", "available date", "start work date", "onboard date"] }
  ];
  const GENERIC_CONTAINMENT_ALIASES = new Set(["name", "date", "sex", "tel", "rank"]);
  const LOGIN_CONTEXT_TERMS = ["username", "login", "account", "用户账号", "登录账号"];
  const SEMANTIC_MATCH_PREFIXES = [
    "请填写", "请输入", "请选择", "请补充", "请描述", "请说明", "请简述", "请列出",
    "填写", "输入", "选择", "补充", "描述", "说明", "简述", "列出",
    "pleaseenter", "pleaseinput", "pleaseselect", "pleasedescribe",
    "enter", "input", "select", "describe"
  ];
  const SEMANTIC_MATCH_SUFFIXES = [
    "information", "description", "details", "detail", "info",
    "名称", "题目", "标题", "信息", "资料", "详情", "内容", "情况", "记录", "条目", "描述", "说明",
    "name", "title"
  ];
  const SEMANTIC_MATCH_MODIFIERS = ["主要", "具体", "相关", "对应"];
  const SEMANTIC_MATCH_REPLACEMENTS = [
    ["responsibilities", "职责"],
    ["responsibility", "职责"],
    ["jobduties", "职责"],
    ["duties", "职责"],
    ["duty", "职责"],
    ["所承担的职责", "职责"],
    ["承担的职责", "职责"],
    ["所承担的工作", "职责"],
    ["承担的工作", "职责"],
    ["承担工作", "职责"],
    ["所负责的工作", "职责"],
    ["所负责的内容", "职责"],
    ["负责的工作", "职责"],
    ["负责的内容", "职责"],
    ["负责工作", "职责"],
    ["负责内容", "职责"],
    ["工作内容", "职责"],
    ["工作职责", "职责"],
    ["岗位职责", "职责"],
    ["责任", "职责"],
    ["project", "项目"],
    ["paper", "论文"]
  ];

  const state = {
    readyPromise: null,
    visible: false,
    collapsed: false,
    locked: false,
    pinMode: "lock",
    host: null,
    shadow: null,
    panel: null,
    refs: {},
    target: null,
    targetStyle: null,
    matchedFieldId: null,
    activeGroupId: null,
    scrollFrame: null,
    undo: null,
    data: { groups: [], fields: [], profileName: "" },
    toastTimer: null,
    drag: null
  };

  const api = {
    readyPromise: null,
    toggle: () => state.readyPromise.then(togglePanel),
    refresh: () => state.readyPromise.then(refreshPanelData)
  };
  window[INSTANCE_KEY] = api;

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "panel:toggle") {
      void api.toggle();
    } else if (message && message.type === "panel:config-changed") {
      void api.refresh();
    }
  });

  state.readyPromise = initialize();
  api.readyPromise = state.readyPromise;

  async function initialize() {
    const host = document.createElement("div");
    host.id = "resume-autofill-extension-host";
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.width = "0";
    host.style.height = "0";
    host.style.zIndex = "2147483646";
    host.style.pointerEvents = "none";

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = globalThis.ResumeAutofillContentCss
      || ":host{all:initial}.panel{position:fixed;right:24px;top:25%;z-index:2147483646;width:320px;padding:16px;background:#fff;border:1px solid #ccc;color:#111;font:14px sans-serif}.panel[hidden]{display:none}";
    shadow.append(style);

    const panel = document.createElement("section");
    panel.className = "panel";
    panel.hidden = true;
    panel.style.pointerEvents = "auto";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "秋招信息快捷填充助手");
    panel.innerHTML = `
      <header class="panel-header" id="dragHandle">
        <div class="title-block">
          <div class="panel-title">秋招信息快捷填充助手</div>
          <div class="profile-name" id="profileName">正在加载方案…</div>
        </div>
        <div class="header-actions">
          <button class="icon-button" id="collapseButton" type="button" title="折叠" aria-label="折叠">−</button>
          <button class="icon-button" id="closeButton" type="button" title="关闭" aria-label="关闭">×</button>
        </div>
      </header>
      <div class="panel-body">
        <div class="target-card">
          <div class="target-label">当前选中元素</div>
          <div class="target-value" id="targetValue">请点击网页中的输入框</div>
          <div class="target-nearby" id="targetNearby"></div>
          <div class="match-hint" id="matchHint" hidden></div>
        </div>
        <div class="search-wrap">
          <input class="search-input" id="searchInput" type="search" placeholder="搜索信息按钮" autocomplete="off">
        </div>
        <nav class="group-navigation" id="groupNavigation" aria-label="分组快速导航" hidden></nav>
        <div class="field-groups" id="fieldGroups"></div>
      </div>
      <footer class="panel-footer">
        <button class="footer-button" id="undoButton" type="button">撤销填写</button>
        <button class="footer-button" id="lockButton" type="button">锁定面板</button>
        <button class="footer-button" id="optionsButton" type="button">信息设置</button>
      </footer>
      <div class="toast" id="toast" hidden role="status" aria-live="polite"></div>
      <div class="pin-overlay" id="pinOverlay" hidden>
        <form class="pin-card" id="pinForm">
          <h3 id="pinTitle">设置临时 PIN</h3>
          <p id="pinDescription">PIN 仅保留在当前浏览器会话中，不会以明文持久化。</p>
          <input class="pin-input" id="pinInput" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="off" aria-label="临时 PIN">
          <div class="pin-error" id="pinError"></div>
          <div class="pin-actions">
            <button id="pinCancel" type="button">取消</button>
            <button class="primary" type="submit">确认</button>
          </div>
        </form>
      </div>
    `;
    shadow.append(panel);
    (document.documentElement || document.body).append(host);

    state.host = host;
    state.shadow = shadow;
    state.panel = panel;
    state.refs = {
      dragHandle: shadow.getElementById("dragHandle"),
      profileName: shadow.getElementById("profileName"),
      collapseButton: shadow.getElementById("collapseButton"),
      closeButton: shadow.getElementById("closeButton"),
      targetValue: shadow.getElementById("targetValue"),
      targetNearby: shadow.getElementById("targetNearby"),
      matchHint: shadow.getElementById("matchHint"),
      searchInput: shadow.getElementById("searchInput"),
      groupNavigation: shadow.getElementById("groupNavigation"),
      fieldGroups: shadow.getElementById("fieldGroups"),
      undoButton: shadow.getElementById("undoButton"),
      lockButton: shadow.getElementById("lockButton"),
      optionsButton: shadow.getElementById("optionsButton"),
      toast: shadow.getElementById("toast"),
      pinOverlay: shadow.getElementById("pinOverlay"),
      pinForm: shadow.getElementById("pinForm"),
      pinTitle: shadow.getElementById("pinTitle"),
      pinDescription: shadow.getElementById("pinDescription"),
      pinInput: shadow.getElementById("pinInput"),
      pinError: shadow.getElementById("pinError"),
      pinCancel: shadow.getElementById("pinCancel")
    };

    bindPanelEvents();
    bindPageEvents();
  }

  function bindPanelEvents() {
    state.refs.closeButton.addEventListener("click", hidePanel);
    state.refs.collapseButton.addEventListener("click", () => {
      state.collapsed = !state.collapsed;
      state.panel.classList.toggle("is-collapsed", state.collapsed);
      state.refs.collapseButton.textContent = state.collapsed ? "+" : "−";
      state.refs.collapseButton.title = state.collapsed ? "展开" : "折叠";
    });
    state.refs.searchInput.addEventListener("input", applySearchFilter);
    state.refs.groupNavigation.addEventListener("click", (event) => {
      const button = event.target.closest(".group-nav-button");
      if (button) {
        navigateToGroup(button.dataset.groupId, true);
      }
    });
    state.refs.fieldGroups.addEventListener("scroll", scheduleActiveGroupUpdate, { passive: true });
    state.refs.fieldGroups.addEventListener("click", (event) => {
      const button = event.target.closest(".field-button");
      if (!button) {
        return;
      }
      const row = button.closest(".field-row");
      const formatSelect = row && row.querySelector(".format-select");
      void fillSelectedField(button.dataset.fieldId, formatSelect ? formatSelect.value : "");
    });
    state.refs.undoButton.addEventListener("click", undoLastFill);
    state.refs.lockButton.addEventListener("click", () => openPinDialog(state.locked ? "unlock" : "lock"));
    state.refs.optionsButton.addEventListener("click", () => {
      void chrome.runtime.sendMessage({ type: "options:open" });
    });
    state.refs.pinCancel.addEventListener("click", closePinDialog);
    state.refs.pinForm.addEventListener("submit", handlePinSubmit);
    bindDragging();
  }

  function bindPageEvents() {
    for (const eventName of ["focusin", "pointerdown", "click"]) {
      document.addEventListener(eventName, handlePageSelection, true);
    }
  }

  function isPanelEvent(event) {
    return event.composedPath().includes(state.host);
  }

  function handlePageSelection(event) {
    if (!state.visible || state.locked || isPanelEvent(event)) {
      return;
    }

    const element = event.composedPath().find((candidate) => candidate instanceof Element);
    if (!element) {
      return;
    }

    const result = inspectEditableElement(element);
    if (result.supported) {
      selectTarget(result.element);
    } else if (result.relevant && event.type !== "focusin") {
      clearTarget();
      updateTargetInfo(null);
      showToast(result.reason, "error");
    }
  }

  function inspectEditableElement(element) {
    const editable = element.closest("input, textarea, select, [contenteditable]");
    if (!editable) {
      return { supported: false, relevant: false, reason: "" };
    }
    if (state.host.contains(editable)) {
      return { supported: false, relevant: false, reason: "" };
    }
    if (editable.matches(":disabled") || editable.hasAttribute("disabled")) {
      return { supported: false, relevant: true, reason: "该控件已禁用，无法填写" };
    }
    if (editable.hasAttribute("readonly")) {
      return { supported: false, relevant: true, reason: "该控件为只读，无法填写" };
    }

    if (editable instanceof HTMLInputElement) {
      const type = (editable.type || "text").toLowerCase();
      if (BLOCKED_INPUT_TYPES.has(type)) {
        const message = type === "password"
          ? "出于安全原因，插件永远不会填写密码"
          : type === "file"
            ? "插件不支持文件上传控件"
            : `不支持 input[type="${type}"]`;
        return { supported: false, relevant: true, reason: message };
      }
      if (!SUPPORTED_INPUT_TYPES.has(type)) {
        return { supported: false, relevant: true, reason: `不支持 input[type="${type}"]` };
      }
      if (isDangerousField(editable)) {
        return { supported: false, relevant: true, reason: "出于安全原因，不填写验证码、银行卡或支付类控件" };
      }
      return { supported: true, relevant: true, element: editable };
    }

    if (editable instanceof HTMLTextAreaElement || editable instanceof HTMLSelectElement) {
      if (isDangerousField(editable)) {
        return { supported: false, relevant: true, reason: "出于安全原因，不填写验证码、银行卡或支付类控件" };
      }
      return { supported: true, relevant: true, element: editable };
    }

    if (editable.isContentEditable) {
      if (isDangerousField(editable)) {
        return { supported: false, relevant: true, reason: "出于安全原因，不填写验证码、银行卡或支付类控件" };
      }
      return { supported: true, relevant: true, element: editable };
    }

    return { supported: false, relevant: true, reason: "该可编辑控件暂不受支持" };
  }

  function isDangerousField(element) {
    const attributes = [
      element.id,
      element.getAttribute("name"),
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      getNearbyLabel(element)
    ].filter(Boolean).join(" ").toLowerCase().replace(/[\s_-]+/g, "");
    return DANGEROUS_TERMS.some((term) => attributes.includes(term));
  }

  function selectTarget(element) {
    if (state.target === element) {
      updateTargetInfo(element);
      return;
    }
    clearTarget();
    state.target = element;
    state.targetStyle = {
      outline: element.style.outline,
      outlineOffset: element.style.outlineOffset,
      boxShadow: element.style.boxShadow
    };
    element.style.setProperty("outline", "2px solid #2563eb", "important");
    element.style.setProperty("outline-offset", "2px", "important");
    element.style.setProperty("box-shadow", "0 0 0 4px rgba(37, 99, 235, 0.16)", "important");
    updateTargetInfo(element);
    applySmartMatchForTarget(element);
  }

  function clearTarget() {
    if (state.target && state.targetStyle) {
      restoreInlineStyle(state.target, "outline", state.targetStyle.outline);
      restoreInlineStyle(state.target, "outline-offset", state.targetStyle.outlineOffset);
      restoreInlineStyle(state.target, "box-shadow", state.targetStyle.boxShadow);
    }
    state.target = null;
    state.targetStyle = null;
    clearSmartMatch();
  }

  function restoreInlineStyle(element, property, value) {
    if (value) {
      element.style.setProperty(property, value);
    } else {
      element.style.removeProperty(property);
    }
  }

  function updateTargetInfo(element) {
    if (!element) {
      state.refs.targetValue.textContent = "请点击网页中的输入框";
      state.refs.targetNearby.textContent = "";
      state.refs.matchHint.hidden = true;
      state.refs.matchHint.textContent = "";
      return;
    }
    state.refs.targetValue.textContent = describeElement(element);
    const label = getNearbyLabel(element);
    const placeholder = element.getAttribute("placeholder");
    state.refs.targetNearby.textContent = [label && `标签：${label}`, placeholder && `占位：${placeholder}`]
      .filter(Boolean)
      .join(" · ");
  }

  function describeElement(element) {
    const tagName = element.tagName.toLowerCase();
    const attributes = [];
    if (element.id) {
      attributes.push(`#${element.id}`);
    }
    if (element.getAttribute("name")) {
      attributes.push(`[name="${element.getAttribute("name")}"]`);
    }
    if (element instanceof HTMLInputElement && element.type !== "text") {
      attributes.push(`[type="${element.type}"]`);
    }
    if (element.isContentEditable) {
      attributes.push("[contenteditable=\"true\"]");
    }
    return `${tagName}${attributes.join("")}`;
  }

  function getNearbyLabel(element) {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) {
      return cleanText(ariaLabel);
    }
    if (element.id) {
      try {
        const explicitLabel = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (explicitLabel) {
          return cleanText(explicitLabel.textContent);
        }
      } catch (_error) {
        // Invalid legacy identifiers can be ignored.
      }
    }
    const wrappingLabel = element.closest("label");
    if (wrappingLabel) {
      return cleanText(wrappingLabel.textContent);
    }
    const previous = element.previousElementSibling;
    if (previous && previous.matches("label, span, div")) {
      const text = cleanText(previous.textContent);
      if (text.length <= 60) {
        return text;
      }
    }
    return "";
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  async function togglePanel() {
    if (state.visible) {
      hidePanel();
      return;
    }
    state.visible = true;
    state.panel.hidden = false;
    await refreshPanelData();
  }

  function hidePanel() {
    state.visible = false;
    state.panel.hidden = true;
    closePinDialog();
    clearTarget();
    updateTargetInfo(null);
  }

  async function refreshPanelData() {
    if (!state.visible) {
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({ type: "panel:get-data" });
      if (!response || !response.ok) {
        throw new Error(response && response.message);
      }
      state.locked = Boolean(response.data.locked);
      if (state.locked) {
        state.data = { groups: [], fields: [], profileName: "" };
        clearTarget();
        updateTargetInfo(null);
      } else {
        state.data = response.data;
      }
      renderPanelData();
    } catch (_error) {
      showToast("无法读取扩展配置，请重试", "error");
    }
  }

  function renderPanelData() {
    state.refs.profileName.textContent = state.locked ? "面板已锁定" : `当前方案：${state.data.profileName}`;
    state.refs.lockButton.textContent = state.locked ? "解锁面板" : "锁定面板";
    state.refs.searchInput.disabled = state.locked;
    state.refs.undoButton.disabled = state.locked;
    clearSmartMatch();
    state.refs.groupNavigation.replaceChildren();
    state.refs.groupNavigation.hidden = true;
    state.refs.fieldGroups.replaceChildren();

    if (state.locked) {
      const locked = document.createElement("div");
      locked.className = "locked-state";
      const title = document.createElement("strong");
      title.textContent = "信息已隐藏";
      const description = document.createElement("span");
      description.textContent = "解锁前不会显示按钮，也不会读取或填充任何字段。";
      locked.append(title, description);
      state.refs.fieldGroups.append(locked);
      return;
    }

    const fieldsByGroup = new Map();
    for (const field of state.data.fields) {
      if (!fieldsByGroup.has(field.groupId)) {
        fieldsByGroup.set(field.groupId, []);
      }
      fieldsByGroup.get(field.groupId).push(field);
    }
    renderGroupNavigation();

    let renderedCount = 0;
    for (const group of state.data.groups) {
      const groupFields = fieldsByGroup.get(group.id) || [];
      const details = document.createElement("details");
      details.className = "group";
      details.open = true;
      details.dataset.groupId = group.id;
      const summary = document.createElement("summary");
      summary.textContent = group.name;
      const container = document.createElement("div");
      container.className = "group-fields";

      if (groupFields.length === 0) {
        const emptyGroup = document.createElement("div");
        emptyGroup.className = "group-empty";
        emptyGroup.textContent = "该分组暂无字段";
        container.append(emptyGroup);
      }

      for (const field of groupFields.sort((a, b) => a.order - b.order)) {
        const row = document.createElement("div");
        row.className = "field-row";
        row.dataset.searchText = field.label.toLowerCase();
        const button = document.createElement("button");
        button.className = "field-button";
        button.type = "button";
        button.dataset.fieldId = field.id;
        const name = document.createElement("span");
        name.className = "field-name";
        name.textContent = field.label;
        const preview = document.createElement("span");
        preview.className = "field-preview";
        preview.textContent = field.preview;
        button.append(name, preview);
        row.append(button);

        if (field.formats.length > 0) {
          const select = document.createElement("select");
          select.className = "format-select";
          select.setAttribute("aria-label", `${field.label}输出格式`);
          for (const format of field.formats) {
            const option = document.createElement("option");
            option.value = format;
            option.textContent = format;
            select.append(option);
          }
          row.append(select);
        }
        container.append(row);
        renderedCount += 1;
      }

      details.append(summary, container);
      state.refs.fieldGroups.append(details);
    }

    if (renderedCount === 0 && state.data.groups.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "当前方案没有字段，请前往“信息设置”新增。";
      state.refs.fieldGroups.append(empty);
    }
    applySearchFilter();
    if (state.target && state.target.isConnected) {
      applySmartMatchForTarget(state.target);
    } else {
      const firstVisibleGroup = state.refs.fieldGroups.querySelector(".group");
      if (firstVisibleGroup) {
        setActiveGroup(firstVisibleGroup.dataset.groupId);
      }
    }
  }

  function applySearchFilter() {
    const keyword = state.refs.searchInput.value.trim().toLowerCase();
    for (const group of state.refs.fieldGroups.querySelectorAll(".group")) {
      const rows = group.querySelectorAll(".field-row");
      if (rows.length === 0) {
        group.hidden = Boolean(keyword);
        continue;
      }
      let visibleRows = 0;
      for (const row of rows) {
        const visible = !keyword || row.dataset.searchText.includes(keyword);
        row.hidden = !visible;
        visibleRows += visible ? 1 : 0;
      }
      group.hidden = visibleRows === 0;
    }
  }

  function renderGroupNavigation() {
    state.refs.groupNavigation.replaceChildren();
    for (const group of state.data.groups) {
      const button = document.createElement("button");
      button.className = "group-nav-button";
      button.type = "button";
      button.dataset.groupId = group.id;
      button.textContent = group.name;
      button.title = `跳转到${group.name}`;
      state.refs.groupNavigation.append(button);
    }
    state.refs.groupNavigation.hidden = state.refs.groupNavigation.childElementCount === 0;
  }

  function navigateToGroup(groupId, smooth) {
    const group = Array.from(state.refs.fieldGroups.querySelectorAll(".group"))
      .find((candidate) => candidate.dataset.groupId === groupId);
    if (!group) {
      return;
    }
    if (state.refs.searchInput.value) {
      state.refs.searchInput.value = "";
      applySearchFilter();
    }
    group.open = true;
    setActiveGroup(groupId);
    scrollNodeWithinFieldList(group, smooth ? "smooth" : "auto", "start");
  }

  function setActiveGroup(groupId) {
    state.activeGroupId = groupId || null;
    for (const button of state.refs.groupNavigation.querySelectorAll(".group-nav-button")) {
      button.classList.toggle("is-active", button.dataset.groupId === groupId);
    }
  }

  function scheduleActiveGroupUpdate() {
    if (state.scrollFrame !== null) {
      return;
    }
    state.scrollFrame = requestAnimationFrame(() => {
      state.scrollFrame = null;
      const containerRect = state.refs.fieldGroups.getBoundingClientRect();
      const visibleGroups = Array.from(state.refs.fieldGroups.querySelectorAll(".group:not([hidden])"));
      if (!visibleGroups.length) {
        return;
      }
      let closestGroup = visibleGroups[0];
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const group of visibleGroups) {
        const distance = Math.abs(group.getBoundingClientRect().top - containerRect.top - 6);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestGroup = group;
        }
      }
      setActiveGroup(closestGroup.dataset.groupId);
    });
  }

  function scrollNodeWithinFieldList(node, behavior, block) {
    const container = state.refs.fieldGroups;
    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const targetTop = block === "center"
      ? container.scrollTop + nodeRect.top - containerRect.top - (container.clientHeight / 2) + (nodeRect.height / 2)
      : container.scrollTop + nodeRect.top - containerRect.top - 4;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior
    });
  }

  function applySmartMatchForTarget(element) {
    clearSmartMatch();
    if (!element || state.locked || !state.data.fields.length) {
      return;
    }
    const match = findBestFieldMatch(element);
    if (!match) {
      state.refs.matchHint.hidden = true;
      state.refs.matchHint.textContent = "";
      return;
    }

    const button = Array.from(state.refs.fieldGroups.querySelectorAll(".field-button"))
      .find((candidate) => candidate.dataset.fieldId === match.field.id);
    if (!button) {
      return;
    }
    const group = button.closest(".group");
    if (!group) {
      return;
    }

    if (state.refs.searchInput.value) {
      state.refs.searchInput.value = "";
      applySearchFilter();
    }
    group.open = true;
    state.matchedFieldId = match.field.id;
    button.classList.add("is-smart-match");
    button.setAttribute("aria-description", "智能匹配到当前输入框");
    group.classList.add("has-smart-match");
    state.refs.matchHint.textContent = `智能匹配：${match.field.label}`;
    state.refs.matchHint.hidden = false;
    for (const navButton of state.refs.groupNavigation.querySelectorAll(".group-nav-button")) {
      navButton.classList.toggle("has-smart-match", navButton.dataset.groupId === group.dataset.groupId);
    }
    setActiveGroup(group.dataset.groupId);
    requestAnimationFrame(() => {
      scrollNodeWithinFieldList(button.closest(".field-row"), "smooth", "center");
    });
  }

  function clearSmartMatch() {
    state.matchedFieldId = null;
    if (!state.refs.fieldGroups) {
      return;
    }
    for (const button of state.refs.fieldGroups.querySelectorAll(".field-button.is-smart-match")) {
      button.classList.remove("is-smart-match");
      button.removeAttribute("aria-description");
    }
    for (const group of state.refs.fieldGroups.querySelectorAll(".group.has-smart-match")) {
      group.classList.remove("has-smart-match");
    }
    if (state.refs.groupNavigation) {
      for (const button of state.refs.groupNavigation.querySelectorAll(".group-nav-button.has-smart-match")) {
        button.classList.remove("has-smart-match");
      }
    }
    if (state.refs.matchHint) {
      state.refs.matchHint.hidden = true;
      state.refs.matchHint.textContent = "";
    }
  }

  function findBestFieldMatch(element) {
    const signals = buildTargetSignals(element);
    if (!signals.length) {
      return null;
    }
    const ranked = state.data.fields
      .map((field) => ({ field, score: scoreFieldMatch(field, signals, element) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];
    if (!best || best.score < 86) {
      return findSemanticFamilyMatch(signals);
    }
    if (second && best.score - second.score < 10) {
      return findSemanticFamilyMatch(signals);
    }
    return best;
  }

  function findSemanticFamilyMatch(signals) {
    const candidates = state.data.fields
      .map((field, index) => {
        const stem = getSemanticMatchStem(field.label);
        if (!isMeaningfulSemanticStem(stem)) {
          return null;
        }
        const matchingSignals = signals.filter((signal) => getSemanticMatchStem(signal.compact) === stem);
        if (!matchingSignals.length) {
          return null;
        }
        return {
          field,
          index,
          stem,
          score: 88 + Math.max(...matchingSignals.map((signal) => signal.weight))
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.index - b.index);

    const best = candidates[0];
    if (!best) {
      return null;
    }
    const competingFamily = candidates.find((candidate) =>
      candidate.stem !== best.stem && best.score - candidate.score < 10
    );
    return competingFamily ? null : best;
  }

  function getSemanticMatchStem(value) {
    let compact = normalizeMatchText(value).compact;
    const prefix = SEMANTIC_MATCH_PREFIXES.find((candidate) => compact.startsWith(candidate));
    if (prefix) {
      compact = compact.slice(prefix.length);
    }

    compact = compact
      .replace(/^(?:您|你)?在(?=.+(?:中|里|期间))/u, "")
      .replace(/^(?:您的|你的)/u, "")
      .replace(/(?:中|里|期间)(?:的)?(?=(?:主要|具体|相关|对应|所)?(?:承担|负责|工作|岗位|职责|责任))/gu, "");
    for (const modifier of SEMANTIC_MATCH_MODIFIERS) {
      compact = compact.split(modifier).join("");
    }
    for (const [source, replacement] of SEMANTIC_MATCH_REPLACEMENTS) {
      compact = compact.split(source).join(replacement);
    }

    compact = stripTrailingOrdinal(compact);
    const suffix = SEMANTIC_MATCH_SUFFIXES.find((candidate) => compact.endsWith(candidate));
    if (suffix) {
      compact = compact.slice(0, -suffix.length);
    }
    return stripTrailingOrdinal(compact);
  }

  function stripTrailingOrdinal(value) {
    return value.replace(/(?:第?(?:\d+|[一二三四五六七八九十百]+)(?:项|条)?)$/u, "");
  }

  function isMeaningfulSemanticStem(value) {
    if (!value) {
      return false;
    }
    const containsCjk = /[\u3400-\u9fff]/u.test(value);
    return value.length >= (containsCjk ? 2 : 4);
  }

  function buildTargetSignals(element) {
    const signals = [];
    const addSignal = (value, weight) => {
      const normalized = normalizeMatchText(value);
      if (normalized.compact) {
        signals.push({ ...normalized, weight });
      }
    };
    addSignal(getNearbyLabel(element), 14);
    addSignal(getAriaLabelledByText(element), 14);
    addSignal(element.getAttribute("aria-label"), 13);
    addSignal(element.getAttribute("autocomplete"), 13);
    addSignal(element.getAttribute("name"), 11);
    addSignal(element.id, 11);
    addSignal(element.getAttribute("placeholder"), 9);
    addSignal(element.getAttribute("data-field"), 8);
    addSignal(element.getAttribute("data-name"), 8);
    if (element instanceof HTMLInputElement) {
      if (element.type === "email") {
        addSignal("email", 20);
      } else if (element.type === "tel") {
        addSignal("phone", 20);
      }
    }
    return signals;
  }

  function getAriaLabelledByText(element) {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (!labelledBy) {
      return "";
    }
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((label) => cleanText(label.textContent))
      .join(" ");
  }

  function scoreFieldMatch(field, signals, element) {
    const label = normalizeMatchText(field.label);
    const matcher = findFieldMatcher(field);
    const aliases = [field.label, ...(matcher ? matcher.aliases : [])]
      .map(normalizeMatchText)
      .filter((alias) => alias.compact);
    let score = 0;

    for (const signal of signals) {
      if (signal.compact === label.compact) {
        score = Math.max(score, 130 + signal.weight);
      }
      for (const alias of aliases) {
        if (signal.compact === alias.compact) {
          score = Math.max(score, 112 + signal.weight);
        } else if (isMeaningfulContainment(signal, alias)) {
          score = Math.max(score, 82 + signal.weight);
        }
      }
    }

    if (matcher && element instanceof HTMLInputElement) {
      if (element.type === "email" && matcher.key === "email") {
        score = Math.max(score, 116);
      }
      if (element.type === "tel" && matcher.key === "phone") {
        score = Math.max(score, 116);
      }
    }

    const combinedContext = signals.map((signal) => signal.compact).join(" ");
    if (matcher && matcher.key === "name" && LOGIN_CONTEXT_TERMS.some((term) => combinedContext.includes(term))) {
      score = Math.min(score, 70);
    }
    return score;
  }

  function findFieldMatcher(field) {
    const identity = normalizeMatchText(`${field.id} ${field.label}`);
    let bestMatcher = null;
    let bestAliasLength = 0;
    for (const matcher of FIELD_MATCHERS) {
      const candidates = [matcher.key, ...matcher.aliases].map(normalizeMatchText);
      for (const candidate of candidates) {
        const exactLabel = normalizeMatchText(field.label).compact === candidate.compact;
        const keyInId = normalizeMatchText(field.id).compact.includes(normalizeMatchText(matcher.key).compact);
        const aliasInIdentity = candidate.compact.length >= 2 && identity.compact.includes(candidate.compact);
        if ((exactLabel || keyInId || aliasInIdentity) && candidate.compact.length > bestAliasLength) {
          bestMatcher = matcher;
          bestAliasLength = candidate.compact.length;
        }
      }
    }
    return bestMatcher;
  }

  function isMeaningfulContainment(signal, alias) {
    if (!signal.compact || !alias.compact || GENERIC_CONTAINMENT_ALIASES.has(alias.compact)) {
      return false;
    }
    const containsCjk = /[\u3400-\u9fff]/u.test(alias.compact);
    const minimumLength = containsCjk ? 2 : 5;
    if (alias.compact.length < minimumLength) {
      return false;
    }
    return signal.compact.includes(alias.compact)
      || (signal.compact.length >= minimumLength && alias.compact.includes(signal.compact));
  }

  function normalizeMatchText(value) {
    const spaced = String(value || "")
      .normalize("NFKC")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    return {
      spaced,
      compact: spaced.replace(/\s+/g, "")
    };
  }

  async function fillSelectedField(fieldId, format) {
    if (state.locked) {
      showToast("面板已锁定，请先解锁", "error");
      return;
    }
    if (!state.target || !state.target.isConnected) {
      clearTarget();
      updateTargetInfo(null);
      showToast("请先点击需要填写的输入框", "error");
      return;
    }

    const currentInspection = inspectEditableElement(state.target);
    if (!currentInspection.supported) {
      showToast(currentInspection.reason || "目标元素已不可填写", "error");
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ type: "field:get-value", fieldId });
      if (!response || !response.ok) {
        showToast((response && response.message) || "读取字段失败", "error");
        return;
      }
      const field = response.field;
      const value = formatValue(field.value, format, state.target);
      const result = applyValue(state.target, value, true);
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      showToast(`已填入：${field.label}`, "success");
      updateTargetInfo(state.target);
    } catch (_error) {
      showToast("填写失败，请重试", "error");
    }
  }

  function applyValue(element, value, recordUndo) {
    if (element instanceof HTMLSelectElement) {
      const match = findSelectOption(element, value);
      if (!match) {
        return { ok: false, message: "未找到对应选项" };
      }
      return runWithValidationLifecycle(element, () => {
        const oldValue = element.value;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
        setter.call(element, match.value);
        dispatchInputAndChange(element, null);
        if (recordUndo) {
          state.undo = { element, oldValue, kind: "select" };
        }
        return { ok: true };
      });
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return runWithValidationLifecycle(element, () => {
        const oldValue = element.value;
        if (!dispatchBeforeInput(element, value)) {
          return { ok: false, message: "网页阻止了本次输入" };
        }
        const prototype = element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
        setter.call(element, value);
        dispatchInputAndChange(element, value);
        if (recordUndo) {
          state.undo = { element, oldValue, kind: "value" };
        }
        return { ok: true };
      });
    }

    if (element.isContentEditable) {
      return runWithValidationLifecycle(element, () => {
        const oldValue = element.textContent || "";
        if (!dispatchBeforeInput(element, value)) {
          return { ok: false, message: "网页阻止了本次输入" };
        }
        element.textContent = value;
        dispatchInputAndChange(element, value);
        if (recordUndo) {
          state.undo = { element, oldValue, kind: "contenteditable" };
        }
        return { ok: true };
      });
    }

    return { ok: false, message: "目标元素不受支持" };
  }

  function runWithValidationLifecycle(element, apply) {
    const focused = focusWithoutScrolling(element);
    try {
      return apply();
    } finally {
      if (focused && typeof element.blur === "function") {
        try {
          element.blur();
        } catch (_error) {
          // The value and standard input events have already been applied.
        }
      }
    }
  }

  function focusWithoutScrolling(element) {
    if (typeof element.focus !== "function") {
      return false;
    }
    try {
      element.focus({ preventScroll: true });
      return true;
    } catch (_error) {
      try {
        element.focus();
        return true;
      } catch (_fallbackError) {
        return false;
      }
    }
  }

  function findSelectOption(select, value) {
    const normalized = String(value).trim().toLowerCase();
    return Array.from(select.options).find((option) => option.value.trim().toLowerCase() === normalized)
      || Array.from(select.options).find((option) => option.textContent.trim().toLowerCase() === normalized)
      || null;
  }

  function dispatchBeforeInput(element, value) {
    try {
      return element.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        composed: true,
        data: value,
        inputType: "insertText"
      }));
    } catch (_error) {
      return element.dispatchEvent(new Event("beforeinput", {
        bubbles: true,
        cancelable: true,
        composed: true
      }));
    }
  }

  function dispatchInputAndChange(element, value) {
    try {
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: value,
        inputType: "insertText"
      }));
    } catch (_error) {
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }

  function undoLastFill() {
    if (!state.undo || !state.undo.element.isConnected) {
      state.undo = null;
      showToast("没有可撤销的插件填写记录", "error");
      return;
    }
    const { element, oldValue } = state.undo;
    const result = applyValue(element, oldValue, false);
    if (!result.ok) {
      showToast(result.message, "error");
      return;
    }
    state.undo = null;
    selectTarget(element);
    showToast("已撤销上次填写", "success");
  }

  function formatValue(rawValue, requestedFormat, target) {
    const parsed = parseDateParts(rawValue);
    if (!parsed) {
      return rawValue;
    }
    const { year, month, day } = parsed;
    if (target instanceof HTMLInputElement && target.type === "date") {
      return day ? `${year}-${month}-${day}` : rawValue;
    }
    if (target instanceof HTMLInputElement && target.type === "month") {
      return `${year}-${month}`;
    }
    switch (requestedFormat) {
      case "YYYY-MM-DD":
        return day ? `${year}-${month}-${day}` : rawValue;
      case "YYYY/MM/DD":
        return day ? `${year}/${month}/${day}` : rawValue;
      case "YYYY年MM月DD日":
        return day ? `${year}年${month}月${day}日` : rawValue;
      case "YYYY-MM":
        return `${year}-${month}`;
      case "YYYY年MM月":
        return `${year}年${month}月`;
      default:
        return rawValue;
    }
  }

  function parseDateParts(value) {
    const match = String(value).trim().match(/^(\d{4})\D?(\d{1,2})(?:\D?(\d{1,2}))?\D*$/);
    if (!match) {
      return null;
    }
    const monthNumber = Number(match[2]);
    const dayNumber = match[3] ? Number(match[3]) : null;
    if (monthNumber < 1 || monthNumber > 12 || (dayNumber !== null && (dayNumber < 1 || dayNumber > 31))) {
      return null;
    }
    return {
      year: match[1],
      month: String(monthNumber).padStart(2, "0"),
      day: dayNumber === null ? null : String(dayNumber).padStart(2, "0")
    };
  }

  function showToast(message, type = "") {
    clearTimeout(state.toastTimer);
    state.refs.toast.textContent = message;
    state.refs.toast.className = `toast ${type}`.trim();
    state.refs.toast.hidden = false;
    state.toastTimer = setTimeout(() => {
      state.refs.toast.hidden = true;
    }, 2100);
  }

  function openPinDialog(mode) {
    state.pinMode = mode;
    state.refs.pinTitle.textContent = mode === "lock" ? "设置临时 PIN 并锁定" : "输入 PIN 解锁";
    state.refs.pinDescription.textContent = mode === "lock"
      ? "请输入 4～8 位数字。仅保存不可逆摘要，并在浏览器会话结束后失效。"
      : "请输入本浏览器会话中设置的 PIN。";
    state.refs.pinInput.value = "";
    state.refs.pinError.textContent = "";
    state.refs.pinOverlay.hidden = false;
    setTimeout(() => state.refs.pinInput.focus(), 0);
  }

  function closePinDialog() {
    if (!state.refs.pinOverlay) {
      return;
    }
    state.refs.pinOverlay.hidden = true;
    state.refs.pinInput.value = "";
    state.refs.pinError.textContent = "";
  }

  async function handlePinSubmit(event) {
    event.preventDefault();
    const pin = state.refs.pinInput.value.trim();
    if (!/^\d{4,8}$/.test(pin)) {
      state.refs.pinError.textContent = "请输入 4～8 位数字";
      return;
    }
    const messageType = state.pinMode === "lock" ? "panel:lock" : "panel:unlock";
    try {
      const response = await chrome.runtime.sendMessage({ type: messageType, pin });
      state.refs.pinInput.value = "";
      if (!response || !response.ok) {
        state.refs.pinError.textContent = (response && response.message) || "操作失败";
        return;
      }
      closePinDialog();
      await refreshPanelData();
      showToast(state.pinMode === "lock" ? "面板已锁定" : "面板已解锁", "success");
    } catch (_error) {
      state.refs.pinError.textContent = "操作失败，请重试";
    }
  }

  function bindDragging() {
    state.refs.dragHandle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      const rect = state.panel.getBoundingClientRect();
      state.drag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      state.refs.dragHandle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    state.refs.dragHandle.addEventListener("pointermove", (event) => {
      if (!state.drag || state.drag.pointerId !== event.pointerId) {
        return;
      }
      const width = state.panel.offsetWidth;
      const height = state.panel.offsetHeight;
      const left = Math.min(Math.max(0, event.clientX - state.drag.offsetX), Math.max(0, window.innerWidth - width));
      const top = Math.min(Math.max(0, event.clientY - state.drag.offsetY), Math.max(0, window.innerHeight - height));
      state.panel.style.left = `${left}px`;
      state.panel.style.top = `${top}px`;
      state.panel.style.right = "auto";
      state.panel.style.transform = "none";
    });

    const stopDragging = (event) => {
      if (state.drag && state.drag.pointerId === event.pointerId) {
        state.drag = null;
      }
    };
    state.refs.dragHandle.addEventListener("pointerup", stopDragging);
    state.refs.dragHandle.addEventListener("pointercancel", stopDragging);
  }
})();
