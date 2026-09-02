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
  "globalThis.__resumeFillTest = { applyValue, state };\n})();"
);

if (!source.includes("__resumeFillTest")) {
  throw new Error("Unable to instrument content.js for fill validation tests");
}

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = Boolean(init.cancelable);
    this.composed = Boolean(init.composed);
    this.data = init.data ?? null;
    this.inputType = init.inputType || "";
    this.defaultPrevented = false;
    this.target = null;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }
}

class FakeInputEvent extends FakeEvent {}

class FakeElement {
  constructor() {
    this.events = [];
    this.listeners = new Map();
    this.isConnected = true;
    this.isContentEditable = false;
    this.textContent = "";
    this.focused = false;
    this.focusOptions = null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    event.target = this;
    this.events.push({ type: event.type, value: this.value ?? this.textContent });
    for (const listener of this.listeners.get(event.type) || []) {
      listener.call(this, event);
    }
    return !event.defaultPrevented;
  }

  focus(options) {
    this.focusOptions = options || null;
    if (this.focused) {
      return;
    }
    this.focused = true;
    this.dispatchEvent(new FakeEvent("focus"));
    this.dispatchEvent(new FakeEvent("focusin", { bubbles: true, composed: true }));
  }

  blur() {
    if (!this.focused) {
      return;
    }
    this.focused = false;
    this.dispatchEvent(new FakeEvent("blur"));
    this.dispatchEvent(new FakeEvent("focusout", { bubbles: true, composed: true }));
  }
}

class FakeInput extends FakeElement {
  constructor(value = "") {
    super();
    this._value = value;
    this.type = "text";
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = String(value);
  }
}

class FakeTextArea extends FakeInput {}

class FakeSelect extends FakeInput {
  constructor(value = "", options = []) {
    super(value);
    this.options = options;
  }
}

Object.defineProperty(
  FakeTextArea.prototype,
  "value",
  Object.getOwnPropertyDescriptor(FakeInput.prototype, "value")
);
Object.defineProperty(
  FakeSelect.prototype,
  "value",
  Object.getOwnPropertyDescriptor(FakeInput.prototype, "value")
);

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
  Event: FakeEvent,
  InputEvent: FakeInputEvent,
  HTMLInputElement: FakeInput,
  HTMLTextAreaElement: FakeTextArea,
  HTMLSelectElement: FakeSelect,
  Element: FakeElement,
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

const fill = context.__resumeFillTest;

const requiredInput = new FakeInput();
let recognizedValue = "";
requiredInput.addEventListener("focusout", () => {
  recognizedValue = requiredInput.value;
});

const fillResult = fill.applyValue(requiredInput, "张三", true);
assert.equal(fillResult.ok, true);
assert.equal(requiredInput.value, "张三");
assert.equal(recognizedValue, "张三", "focusout validation should observe the filled value");
assert.equal(requiredInput.focusOptions.preventScroll, true);
assert.equal(
  requiredInput.events.map((event) => event.type).join(","),
  "focus,focusin,beforeinput,input,change,blur,focusout"
);
assert.equal(requiredInput.events.at(-1).value, "张三");

const blockedInput = new FakeInput();
blockedInput.addEventListener("beforeinput", (event) => event.preventDefault());
const blockedResult = fill.applyValue(blockedInput, "不应写入", false);
assert.equal(blockedResult.ok, false);
assert.equal(blockedResult.message, "网页阻止了本次输入");
assert.equal(blockedInput.value, "");
assert.equal(
  blockedInput.events.map((event) => event.type).join(","),
  "focus,focusin,beforeinput,blur,focusout"
);

const educationSelect = new FakeSelect("", [
  { value: "", textContent: "请选择" },
  { value: "硕士", textContent: "硕士" }
]);
let recognizedSelection = "";
educationSelect.addEventListener("focusout", () => {
  recognizedSelection = educationSelect.value;
});
const selectResult = fill.applyValue(educationSelect, "硕士", true);
assert.equal(selectResult.ok, true);
assert.equal(educationSelect.value, "硕士");
assert.equal(recognizedSelection, "硕士");
assert.equal(
  educationSelect.events.map((event) => event.type).join(","),
  "focus,focusin,input,change,blur,focusout"
);

const editable = new FakeElement();
editable.isContentEditable = true;
let recognizedEditableText = "";
editable.addEventListener("focusout", () => {
  recognizedEditableText = editable.textContent;
});
const editableResult = fill.applyValue(editable, "项目经历", true);
assert.equal(editableResult.ok, true);
assert.equal(editable.textContent, "项目经历");
assert.equal(recognizedEditableText, "项目经历");
assert.equal(
  editable.events.map((event) => event.type).join(","),
  "focus,focusin,beforeinput,input,change,blur,focusout"
);

console.log("Fill validation regression tests: OK");
