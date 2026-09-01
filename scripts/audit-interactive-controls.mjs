import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const roots = ["app", "src"];
const interactive = new Set(["Pressable", "TouchableOpacity", "TouchableHighlight", "TouchableWithoutFeedback", "Link"]);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(tsx|jsx)$/.test(entry.name)) files.push(absolute);
  }
}

roots.filter(fs.existsSync).forEach(walk);
const results = { working: [], comingSoon: [], disabled: [], dead: [] };

for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (interactive.has(tag)) {
        const attrs = new Set(node.attributes.properties
          .filter(ts.isJsxAttribute)
          .map((attribute) => attribute.name.getText(source)));
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const item = `${file}:${line} ${tag}`;
        const openingSource = node.getText(source);
        if ((attrs.has("onPress") || attrs.has("href")) && /coming soon/i.test(openingSource)) results.comingSoon.push(item);
        else if (attrs.has("onPress") || attrs.has("href")) results.working.push(item);
        else if (attrs.has("disabled")) results.disabled.push(item);
        else results.dead.push(item);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const total = results.working.length + results.comingSoon.length + results.disabled.length + results.dead.length;
console.log(JSON.stringify({
  total,
  working: results.working.length,
  comingSoon: results.comingSoon.length,
  disabled: results.disabled.length,
  dead: results.dead.length,
  deadControls: results.dead,
}, null, 2));

if (results.dead.length) process.exitCode = 1;
