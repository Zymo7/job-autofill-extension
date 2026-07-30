"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
let source = fs.readFileSync(path.join(projectRoot, "content.js"), "utf8");

source = source.replace(
  /state\.readyPromise = initialize\(\);\s*api\.readyPromise = state\.readyPromise;/,
  "api.readyPromise = Promise.resolve();"
);
source = source.replace(
  /\}\)\(\);\s*$/,
  "globalThis.__resumeMatcherTest = { findBestFieldMatch, state };\n})();"
);

if (!source.includes("__resumeMatcherTest")) {
  throw new Error("Unable to instrument content.js for matcher tests");
}

class FakeInput {
  constructor({ id = "", type = "text", attributes = {} } = {}) {
    this.id = id;
    this.type = type;
    this.attributes = { ...attributes };
    this.previousElementSibling = null;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  closest() {
    return null;
  }
}

const context = {
  window: {},
  chrome: {
    runtime: {
      onMessage: {
        addListener() {}
      }
    }
  },
  document: {
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    }
  },
  CSS: {
    escape(value) {
      return value;
    }
  },
  HTMLInputElement: FakeInput,
  HTMLTextAreaElement: class {},
  HTMLSelectElement: class {},
  Element: class {},
  Promise,
  Set,
  Map,
  String,
  Number,
  Array,
  Object,
  Math,
  RegExp
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "content.js" });

const matcher = context.__resumeMatcherTest;
matcher.state.data.fields = [
  { id: "field-name", label: "姓名" },
  { id: "field-phone", label: "手机号" },
  { id: "field-email", label: "邮箱" },
  { id: "field-birthDate", label: "出生日期" },
  { id: "field-school", label: "学校" },
  { id: "field-education", label: "学历" },
  { id: "field-degree", label: "学位" },
  { id: "field-expectedPosition", label: "期望岗位" },
  { id: "field-paper-1", label: "论文名称1" },
  { id: "field-paper-2", label: "论文名称2" },
  { id: "field-project-name-1", label: "项目名称1" },
  { id: "field-project-name-2", label: "项目名称2" },
  { id: "field-project-duty-1", label: "项目职责1" },
  { id: "field-project-duty-2", label: "项目职责2" }
];

function matchedFieldId(input) {
  const result = matcher.findBestFieldMatch(input);
  return result ? result.field.id : null;
}

assert.equal(matchedFieldId(new FakeInput({ type: "tel" })), "field-phone");
assert.equal(matchedFieldId(new FakeInput({ type: "email" })), "field-email");
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { "aria-label": "毕业院校" } })),
  "field-school"
);
assert.equal(matchedFieldId(new FakeInput({ id: "birthDate" })), "field-birthDate");
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { name: "expectedPosition" } })),
  "field-expectedPosition"
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { placeholder: "请输入姓名" } })),
  "field-name"
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { "aria-label": "学历/学位" } })),
  null
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { name: "username" } })),
  null
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { "aria-label": "论文信息" } })),
  "field-paper-1"
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { placeholder: "请填写论文标题" } })),
  "field-paper-1"
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { "aria-label": "个人信息" } })),
  null
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { "aria-label": "项目中职责" } })),
  "field-project-duty-1"
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { "aria-label": "项目中的主要职责" } })),
  "field-project-duty-1"
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { placeholder: "请描述您在项目中承担的主要工作" } })),
  "field-project-duty-1"
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { placeholder: "请说明项目期间所负责的具体内容" } })),
  "field-project-duty-1"
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { "aria-label": "项目工作内容" } })),
  "field-project-duty-1"
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { "aria-label": "项目责任" } })),
  "field-project-duty-1"
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { "aria-label": "Project responsibilities" } })),
  "field-project-duty-1"
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { "aria-label": "项目名称" } })),
  "field-project-name-1"
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { "aria-label": "项目名称/项目职责" } })),
  null
);
assert.equal(
  matchedFieldId(new FakeInput({ attributes: { "aria-label": "在校经历" } })),
  null
);

console.log("Smart-match regression tests: OK");
