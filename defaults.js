(function initResumeAutofillDefaults(global) {
  "use strict";

  const CONFIG_KEY = "resumeAutofillConfig";
  const CONFIG_VERSION = 1;

  const GROUP_TEMPLATES = [
    { id: "group-basic", name: "基本信息" },
    { id: "group-education", name: "教育信息" },
    { id: "group-job", name: "求职信息" }
  ];

  const FIELD_TEMPLATES = [
    ["name", "姓名", "group-basic", false],
    ["gender", "性别", "group-basic", false],
    ["birthDate", "出生日期", "group-basic", true, ["YYYY-MM-DD", "YYYY/MM/DD", "YYYY年MM月DD日"]],
    ["phone", "手机号", "group-basic", true],
    ["email", "邮箱", "group-basic", true],
    ["idCard", "身份证号", "group-basic", true],
    ["ethnicity", "民族", "group-basic", false],
    ["politicalStatus", "政治面貌", "group-basic", false],
    ["nativePlace", "籍贯", "group-basic", false],
    ["currentCity", "现居住地", "group-basic", false],
    ["address", "详细地址", "group-basic", true],
    ["school", "学校", "group-education", false],
    ["college", "学院", "group-education", false],
    ["major", "专业", "group-education", false],
    ["education", "学历", "group-education", false],
    ["degree", "学位", "group-education", false],
    ["enrollmentDate", "入学时间", "group-education", false, ["YYYY-MM", "YYYY年MM月"]],
    ["graduationDate", "毕业时间", "group-education", false, ["YYYY-MM", "YYYY年MM月"]],
    ["gpa", "GPA", "group-education", false],
    ["rank", "专业排名", "group-education", false],
    ["jobDirection", "求职方向", "group-job", false],
    ["expectedCity", "期望城市", "group-job", false],
    ["expectedPosition", "期望岗位", "group-job", false],
    ["availableDate", "可入职时间", "group-job", false, ["YYYY-MM-DD", "YYYY/MM/DD", "YYYY年MM月DD日"]]
  ];

  function createId(prefix) {
    const randomPart = global.crypto && typeof global.crypto.randomUUID === "function"
      ? global.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${randomPart}`;
  }

  function createDefaultProfile(name = "中文简历") {
    const groups = GROUP_TEMPLATES.map((group, index) => ({
      ...group,
      order: index
    }));
    const groupCounts = {};
    const fields = FIELD_TEMPLATES.map(([key, label, groupId, sensitive, formats]) => {
      const order = groupCounts[groupId] || 0;
      groupCounts[groupId] = order + 1;
      return {
        id: `field-${key}`,
        label,
        value: "",
        groupId,
        sensitive: Boolean(sensitive),
        formats: Array.isArray(formats) ? [...formats] : [],
        order
      };
    });

    return {
      id: createId("profile"),
      name,
      groups,
      fields
    };
  }

  function createDefaultConfig() {
    const profile = createDefaultProfile();
    return {
      version: CONFIG_VERSION,
      activeProfileId: profile.id,
      profiles: [profile]
    };
  }

  function normalizeString(value, fallback = "") {
    return typeof value === "string" ? value.slice(0, 10000) : fallback;
  }

  function normalizeConfig(candidate) {
    if (!candidate || typeof candidate !== "object" || !Array.isArray(candidate.profiles)) {
      return createDefaultConfig();
    }

    const profiles = candidate.profiles.slice(0, 30).map((profile, profileIndex) => {
      const profileId = normalizeString(profile && profile.id, createId("profile"));
      let groups = Array.isArray(profile && profile.groups)
        ? profile.groups.slice(0, 100).map((group, groupIndex) => ({
            id: normalizeString(group && group.id, createId("group")),
            name: normalizeString(group && group.name, `分组 ${groupIndex + 1}`).trim() || `分组 ${groupIndex + 1}`,
            order: Number.isFinite(group && group.order) ? group.order : groupIndex
          }))
        : [];

      if (groups.length === 0) {
        groups = [{ id: createId("group"), name: "未分组", order: 0 }];
      }

      const groupIds = new Set(groups.map((group) => group.id));
      const fallbackGroupId = groups[0].id;
      const fields = Array.isArray(profile && profile.fields)
        ? profile.fields.slice(0, 1000).map((field, fieldIndex) => ({
            id: normalizeString(field && field.id, createId("field")),
            label: normalizeString(field && field.label, `字段 ${fieldIndex + 1}`).trim() || `字段 ${fieldIndex + 1}`,
            value: normalizeString(field && field.value),
            groupId: groupIds.has(field && field.groupId) ? field.groupId : fallbackGroupId,
            sensitive: Boolean(field && field.sensitive),
            formats: Array.isArray(field && field.formats)
              ? field.formats
                  .filter((format) => typeof format === "string")
                  .slice(0, 20)
                  .map((format) => format.trim().slice(0, 40))
                  .filter(Boolean)
              : [],
            order: Number.isFinite(field && field.order) ? field.order : fieldIndex
          }))
        : [];

      groups = groups
        .sort((a, b) => a.order - b.order)
        .map((group, index) => ({ ...group, order: index }));

      for (const group of groups) {
        const groupFields = fields
          .filter((field) => field.groupId === group.id)
          .sort((a, b) => a.order - b.order);
        groupFields.forEach((field, index) => {
          field.order = index;
        });
      }

      return {
        id: profileId,
        name: normalizeString(profile && profile.name, `方案 ${profileIndex + 1}`).trim() || `方案 ${profileIndex + 1}`,
        groups,
        fields
      };
    });

    if (profiles.length === 0) {
      return createDefaultConfig();
    }

    const activeProfileId = profiles.some((profile) => profile.id === candidate.activeProfileId)
      ? candidate.activeProfileId
      : profiles[0].id;

    return {
      version: CONFIG_VERSION,
      activeProfileId,
      profiles
    };
  }

  global.ResumeAutofillDefaults = Object.freeze({
    CONFIG_KEY,
    CONFIG_VERSION,
    createId,
    createDefaultProfile,
    createDefaultConfig,
    normalizeConfig
  });
})(globalThis);
