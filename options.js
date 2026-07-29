"use strict";

const {
  CONFIG_KEY,
  createDefaultConfig,
  createDefaultProfile,
  createId,
  normalizeConfig
} = globalThis.ResumeAutofillDefaults;

const state = {
  config: null,
  editingFieldId: null,
  toastTimer: null
};

const refs = {};

document.addEventListener("DOMContentLoaded", () => {
  collectRefs();
  bindEvents();
  void loadConfig();
});

function collectRefs() {
  for (const id of [
    "saveStatus", "profileTabs", "addProfileButton", "renameProfileButton",
    "deleteProfileButton", "groupList", "addGroupButton", "fieldTableBody",
    "addFieldButton", "exportButton", "importButton", "restoreButton",
    "clearButton", "importFileInput", "fieldDialog", "fieldForm",
    "fieldDialogTitle", "closeFieldDialogButton", "cancelFieldButton",
    "fieldLabelInput", "fieldValueInput", "fieldGroupSelect",
    "fieldFormatsInput", "fieldSensitiveInput", "fieldFormError", "pageToast"
  ]) {
    refs[id] = document.getElementById(id);
  }
}

function bindEvents() {
  refs.addProfileButton.addEventListener("click", addProfile);
  refs.renameProfileButton.addEventListener("click", renameProfile);
  refs.deleteProfileButton.addEventListener("click", deleteProfile);
  refs.addGroupButton.addEventListener("click", addGroup);
  refs.addFieldButton.addEventListener("click", () => openFieldDialog());
  refs.exportButton.addEventListener("click", exportConfig);
  refs.importButton.addEventListener("click", () => refs.importFileInput.click());
  refs.importFileInput.addEventListener("change", importConfig);
  refs.restoreButton.addEventListener("click", restoreDefaultTemplate);
  refs.clearButton.addEventListener("click", clearAllData);
  refs.closeFieldDialogButton.addEventListener("click", closeFieldDialog);
  refs.cancelFieldButton.addEventListener("click", closeFieldDialog);
  refs.fieldForm.addEventListener("submit", saveFieldFromDialog);
  refs.profileTabs.addEventListener("click", handleProfileAction);
  refs.groupList.addEventListener("click", handleGroupAction);
  refs.fieldTableBody.addEventListener("click", handleFieldAction);
}

async function loadConfig() {
  try {
    const result = await chrome.storage.local.get(CONFIG_KEY);
    state.config = normalizeConfig(result[CONFIG_KEY] || createDefaultConfig());
    await chrome.storage.local.set({ [CONFIG_KEY]: state.config });
    render();
    setSaveStatus("已保存");
  } catch (_error) {
    state.config = createDefaultConfig();
    render();
    setSaveStatus("读取失败", "error");
    showToast("无法读取本地配置，请重新打开设置页", true);
  }
}

function activeProfile() {
  return state.config.profiles.find((profile) => profile.id === state.config.activeProfileId)
    || state.config.profiles[0];
}

function render() {
  renderProfiles();
  renderGroups();
  renderFields();
}

function renderProfiles() {
  refs.profileTabs.replaceChildren();
  for (const profile of state.config.profiles) {
    const button = document.createElement("button");
    button.className = "profile-tab";
    button.type = "button";
    button.role = "tab";
    button.dataset.profileId = profile.id;
    button.setAttribute("aria-selected", String(profile.id === state.config.activeProfileId));
    button.textContent = profile.name;
    refs.profileTabs.append(button);
  }
  refs.deleteProfileButton.disabled = state.config.profiles.length <= 1;
}

function renderGroups() {
  refs.groupList.replaceChildren();
  const profile = activeProfile();
  const groups = [...profile.groups].sort((a, b) => a.order - b.order);
  for (const [index, group] of groups.entries()) {
    const item = document.createElement("div");
    item.className = "group-item";
    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = group.name;
    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = `${profile.fields.filter((field) => field.groupId === group.id).length} 个字段`;
    title.append(count);

    const actions = document.createElement("div");
    actions.className = "mini-actions";
    actions.append(
      actionButton("↑", "group-up", group.id, "上移", index === 0),
      actionButton("↓", "group-down", group.id, "下移", index === groups.length - 1),
      actionButton("编辑", "group-edit", group.id, "编辑分组"),
      actionButton("删除", "group-delete", group.id, "删除分组", false, true)
    );
    item.append(title, actions);
    refs.groupList.append(item);
  }
}

function renderFields() {
  refs.fieldTableBody.replaceChildren();
  const profile = activeProfile();
  const groups = [...profile.groups].sort((a, b) => a.order - b.order);
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const sortedFields = [...profile.fields].sort((a, b) => {
    const groupOrderDifference = (groupMap.get(a.groupId)?.order || 0) - (groupMap.get(b.groupId)?.order || 0);
    return groupOrderDifference || a.order - b.order;
  });

  if (sortedFields.length === 0) {
    const row = document.createElement("tr");
    row.className = "empty-row";
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "当前方案暂无字段。点击“新增字段”开始配置。";
    row.append(cell);
    refs.fieldTableBody.append(row);
    return;
  }

  for (const field of sortedFields) {
    const row = document.createElement("tr");
    const labelCell = document.createElement("td");
    labelCell.className = "field-label-cell";
    labelCell.textContent = field.label;

    const groupCell = document.createElement("td");
    groupCell.textContent = groupMap.get(field.groupId)?.name || "未分组";

    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = `status-pill${field.value ? "" : " empty"}`;
    status.textContent = field.value ? "已设置" : "未设置";
    statusCell.append(status);

    const sensitiveCell = document.createElement("td");
    sensitiveCell.className = "sensitive-pill";
    sensitiveCell.textContent = field.sensitive ? "是" : "否";

    const formatsCell = document.createElement("td");
    formatsCell.className = "formats-cell";
    formatsCell.title = field.formats.join(", ");
    formatsCell.textContent = field.formats.length ? field.formats.join(", ") : "—";

    const actionsCell = document.createElement("td");
    const groupFields = profile.fields
      .filter((candidate) => candidate.groupId === field.groupId)
      .sort((a, b) => a.order - b.order);
    const index = groupFields.findIndex((candidate) => candidate.id === field.id);
    const actions = document.createElement("div");
    actions.className = "mini-actions";
    actions.append(
      actionButton("↑", "field-up", field.id, "上移", index === 0),
      actionButton("↓", "field-down", field.id, "下移", index === groupFields.length - 1),
      actionButton("编辑", "field-edit", field.id, "编辑字段"),
      actionButton("删除", "field-delete", field.id, "删除字段", false, true)
    );
    actionsCell.append(actions);
    row.append(labelCell, groupCell, statusCell, sensitiveCell, formatsCell, actionsCell);
    refs.fieldTableBody.append(row);
  }
}

function actionButton(text, action, id, title, disabled = false, danger = false) {
  const button = document.createElement("button");
  button.className = `icon-action${danger ? " danger-text" : ""}`;
  button.type = "button";
  button.dataset.action = action;
  button.dataset.id = id;
  button.title = title;
  button.disabled = disabled;
  button.textContent = text;
  return button;
}

async function persist(message = "已保存") {
  setSaveStatus("正在保存…", "saving");
  try {
    state.config = normalizeConfig(state.config);
    await chrome.storage.local.set({ [CONFIG_KEY]: state.config });
    render();
    setSaveStatus(message);
  } catch (_error) {
    setSaveStatus("保存失败", "error");
    showToast("保存失败，请重试", true);
  }
}

function setSaveStatus(text, className = "") {
  refs.saveStatus.textContent = text;
  refs.saveStatus.className = `save-status ${className}`.trim();
}

function handleProfileAction(event) {
  const button = event.target.closest("[data-profile-id]");
  if (!button || button.dataset.profileId === state.config.activeProfileId) {
    return;
  }
  state.config.activeProfileId = button.dataset.profileId;
  void persist("已切换方案");
}

function addProfile() {
  const name = window.prompt("请输入新方案名称，例如“英文简历”或“技术岗位”");
  if (!name || !name.trim()) {
    return;
  }
  const profile = createDefaultProfile(name.trim().slice(0, 80));
  state.config.profiles.push(profile);
  state.config.activeProfileId = profile.id;
  void persist("新方案已创建");
}

function renameProfile() {
  const profile = activeProfile();
  const name = window.prompt("请输入方案名称", profile.name);
  if (!name || !name.trim()) {
    return;
  }
  profile.name = name.trim().slice(0, 80);
  void persist("方案已重命名");
}

function deleteProfile() {
  if (state.config.profiles.length <= 1) {
    showToast("至少保留一个信息方案", true);
    return;
  }
  const profile = activeProfile();
  if (!window.confirm(`确定删除方案“${profile.name}”及其全部字段吗？此操作无法撤销。`)) {
    return;
  }
  state.config.profiles = state.config.profiles.filter((candidate) => candidate.id !== profile.id);
  state.config.activeProfileId = state.config.profiles[0].id;
  void persist("方案已删除");
}

function addGroup() {
  const name = window.prompt("请输入分组名称");
  if (!name || !name.trim()) {
    return;
  }
  const profile = activeProfile();
  profile.groups.push({
    id: createId("group"),
    name: name.trim().slice(0, 80),
    order: profile.groups.length
  });
  void persist("分组已新增");
}

function handleGroupAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button || !button.dataset.action.startsWith("group-")) {
    return;
  }
  const profile = activeProfile();
  const groups = [...profile.groups].sort((a, b) => a.order - b.order);
  const index = groups.findIndex((group) => group.id === button.dataset.id);
  if (index < 0) {
    return;
  }

  if (button.dataset.action === "group-up" && index > 0) {
    [groups[index - 1].order, groups[index].order] = [groups[index].order, groups[index - 1].order];
    void persist("分组顺序已更新");
  } else if (button.dataset.action === "group-down" && index < groups.length - 1) {
    [groups[index + 1].order, groups[index].order] = [groups[index].order, groups[index + 1].order];
    void persist("分组顺序已更新");
  } else if (button.dataset.action === "group-edit") {
    const name = window.prompt("请输入分组名称", groups[index].name);
    if (name && name.trim()) {
      groups[index].name = name.trim().slice(0, 80);
      void persist("分组已更新");
    }
  } else if (button.dataset.action === "group-delete") {
    deleteGroup(groups[index]);
  }
}

function deleteGroup(group) {
  const profile = activeProfile();
  if (profile.groups.length <= 1) {
    showToast("至少保留一个分组", true);
    return;
  }
  const fieldsInGroup = profile.fields.filter((field) => field.groupId === group.id);
  const message = fieldsInGroup.length
    ? `分组“${group.name}”包含 ${fieldsInGroup.length} 个字段。删除后这些字段会移动到第一个剩余分组，是否继续？`
    : `确定删除空分组“${group.name}”吗？`;
  if (!window.confirm(message)) {
    return;
  }
  profile.groups = profile.groups.filter((candidate) => candidate.id !== group.id);
  const fallbackGroup = [...profile.groups].sort((a, b) => a.order - b.order)[0];
  for (const field of fieldsInGroup) {
    field.groupId = fallbackGroup.id;
    field.order = profile.fields.filter((candidate) => candidate.groupId === fallbackGroup.id).length;
  }
  void persist("分组已删除");
}

function openFieldDialog(fieldId = null) {
  const profile = activeProfile();
  state.editingFieldId = fieldId;
  const field = fieldId ? profile.fields.find((candidate) => candidate.id === fieldId) : null;
  refs.fieldDialogTitle.textContent = field ? "编辑字段" : "新增字段";
  refs.fieldLabelInput.value = field ? field.label : "";
  refs.fieldValueInput.value = field ? field.value : "";
  refs.fieldFormatsInput.value = field ? field.formats.join(", ") : "";
  refs.fieldSensitiveInput.checked = field ? field.sensitive : false;
  refs.fieldFormError.textContent = "";
  refs.fieldGroupSelect.replaceChildren();
  for (const group of [...profile.groups].sort((a, b) => a.order - b.order)) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    option.selected = field ? field.groupId === group.id : false;
    refs.fieldGroupSelect.append(option);
  }
  refs.fieldDialog.showModal();
  setTimeout(() => refs.fieldLabelInput.focus(), 0);
}

function closeFieldDialog() {
  refs.fieldDialog.close();
  state.editingFieldId = null;
  refs.fieldFormError.textContent = "";
}

function saveFieldFromDialog(event) {
  event.preventDefault();
  const profile = activeProfile();
  const label = refs.fieldLabelInput.value.trim();
  const groupId = refs.fieldGroupSelect.value;
  if (!label) {
    refs.fieldFormError.textContent = "请输入按钮名称";
    return;
  }
  if (!profile.groups.some((group) => group.id === groupId)) {
    refs.fieldFormError.textContent = "请选择有效分组";
    return;
  }
  const formats = refs.fieldFormatsInput.value
    .split(/[,，]/)
    .map((format) => format.trim())
    .filter(Boolean)
    .slice(0, 20);

  const existing = state.editingFieldId
    ? profile.fields.find((field) => field.id === state.editingFieldId)
    : null;
  if (existing) {
    const groupChanged = existing.groupId !== groupId;
    existing.label = label.slice(0, 80);
    existing.value = refs.fieldValueInput.value.slice(0, 10000);
    existing.groupId = groupId;
    existing.sensitive = refs.fieldSensitiveInput.checked;
    existing.formats = formats;
    if (groupChanged) {
      existing.order = profile.fields.filter((field) => field.groupId === groupId).length;
    }
  } else {
    profile.fields.push({
      id: createId("field"),
      label: label.slice(0, 80),
      value: refs.fieldValueInput.value.slice(0, 10000),
      groupId,
      sensitive: refs.fieldSensitiveInput.checked,
      formats,
      order: profile.fields.filter((field) => field.groupId === groupId).length
    });
  }
  closeFieldDialog();
  void persist(existing ? "字段已更新" : "字段已新增");
}

function handleFieldAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button || !button.dataset.action.startsWith("field-")) {
    return;
  }
  const profile = activeProfile();
  const field = profile.fields.find((candidate) => candidate.id === button.dataset.id);
  if (!field) {
    return;
  }
  if (button.dataset.action === "field-edit") {
    openFieldDialog(field.id);
  } else if (button.dataset.action === "field-delete") {
    if (window.confirm(`确定删除字段“${field.label}”吗？`)) {
      profile.fields = profile.fields.filter((candidate) => candidate.id !== field.id);
      void persist("字段已删除");
    }
  } else {
    moveField(field, button.dataset.action === "field-up" ? -1 : 1);
  }
}

function moveField(field, direction) {
  const profile = activeProfile();
  const fields = profile.fields
    .filter((candidate) => candidate.groupId === field.groupId)
    .sort((a, b) => a.order - b.order);
  const index = fields.findIndex((candidate) => candidate.id === field.id);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= fields.length) {
    return;
  }
  [fields[index].order, fields[targetIndex].order] = [fields[targetIndex].order, fields[index].order];
  void persist("字段顺序已更新");
}

function exportConfig() {
  const json = JSON.stringify(state.config, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `job-autofill-config-${date}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast("配置已导出。文件可能含敏感信息，请妥善保管。");
}

async function importConfig(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) {
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    const normalized = normalizeConfig(parsed);
    if (!window.confirm(`将导入 ${normalized.profiles.length} 个方案并覆盖当前全部配置，是否继续？`)) {
      return;
    }
    state.config = normalized;
    await persist("配置已导入");
    showToast("导入成功");
  } catch (_error) {
    showToast("JSON 文件无效或无法读取", true);
  }
}

function restoreDefaultTemplate() {
  const profile = activeProfile();
  if (!window.confirm(`恢复方案“${profile.name}”的默认字段模板？该方案现有字段和值会被覆盖。`)) {
    return;
  }
  const replacement = createDefaultProfile(profile.name);
  replacement.id = profile.id;
  const index = state.config.profiles.findIndex((candidate) => candidate.id === profile.id);
  state.config.profiles[index] = replacement;
  void persist("默认模板已恢复");
}

function clearAllData() {
  if (!window.confirm("这会删除全部方案和填写值。是否继续第一步确认？")) {
    return;
  }
  const confirmation = window.prompt("二次确认：请输入“清空全部数据”");
  if (confirmation !== "清空全部数据") {
    showToast("输入不匹配，已取消清空", true);
    return;
  }
  state.config = createDefaultConfig();
  void persist("全部数据已清空");
}

function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  refs.pageToast.textContent = message;
  refs.pageToast.className = `toast${isError ? " error" : ""}`;
  refs.pageToast.hidden = false;
  state.toastTimer = setTimeout(() => {
    refs.pageToast.hidden = true;
  }, 2800);
}
