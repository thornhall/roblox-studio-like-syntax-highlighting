"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = __importStar(require("vscode"));
const FUNCTION_REGEX = /\bfunction\b/;
const END_REGEX = /\bend\b/;
const DO_REGEX = /\bdo\b/;
const IF_REGEX = /\bif\b/;
const THEN_REGEX = /\bthen\b/;
const FOR_REGEX = /\bfor\b/;
const WHILE_REGEX = /\bwhile\b/;
const REPEAT_REGEX = /\brepeat\b/;
const UNTIL_REGEX = /\buntil\b/;
function getIndentation(editor) {
    const insertSpaces = editor.options.insertSpaces === true;
    const tabSize = Number(editor.options.tabSize);
    if (insertSpaces) {
        return ' '.repeat(tabSize);
    }
    else {
        return '\t';
    }
}
function stripCommentsAndStrings(line) {
    // Remove strings (handles both "..." and '...')
    let noStrings = line.replace(/(['"]).*?\1/g, "");
    // Remove single-line comments
    noStrings = noStrings.replace(/--.*/, "");
    return noStrings;
}
function isMultilineCommentStart(lineText) {
    return /--\[\[/.test(lineText);
}
function isMultilineCommentEnd(lineText) {
    return /\]\]/.test(lineText);
}
function areScopesFullyClosed(doc) {
    let nesting = 0;
    let insideMultilineComment = false;
    for (let i = 0; i < doc.lineCount; i++) {
        let lineText = doc.lineAt(i).text;
        if (insideMultilineComment) {
            if (isMultilineCommentEnd(lineText)) {
                insideMultilineComment = false;
            }
            continue;
        }
        if (isMultilineCommentStart(lineText)) {
            insideMultilineComment = true;
            continue;
        }
        lineText = stripCommentsAndStrings(lineText);
        if (FUNCTION_REGEX.test(lineText))
            nesting++;
        if (WHILE_REGEX.test(lineText))
            nesting++;
        if (FOR_REGEX.test(lineText))
            nesting++;
        if (IF_REGEX.test(lineText))
            nesting++;
        if (REPEAT_REGEX.test(lineText))
            nesting++;
        if (UNTIL_REGEX.test(lineText))
            nesting--;
        if (END_REGEX.test(lineText))
            nesting--;
    }
    if (nesting === 0) {
        return true;
    }
    return false;
}
const definitionCache = new Map();
const symbolToFileMap = new Map();
function findSymbolDefinitionInWorkspace(symbolName) {
    return __awaiter(this, void 0, void 0, function* () {
        if (definitionCache.has(symbolName)) {
            return definitionCache.get(symbolName);
        }
        const files = yield vscode.workspace.findFiles("**/*.{lua,luau}", "**/node_modules/**");
        const regexPatterns = [
            new RegExp(`\\b(export\\s+)?type\\s+${symbolName}\\b`), // type declaration
            new RegExp(`function\\s+[A-Za-z_][A-Za-z0-9_]*\\:${symbolName}\\s*\\(`), // class method
        ];
        for (const file of files) {
            const document = yield vscode.workspace.openTextDocument(file);
            const text = document.getText();
            for (const regex of regexPatterns) {
                const match = regex.exec(text);
                if (match) {
                    const index = match.index;
                    const position = document.positionAt(index);
                    const location = new vscode.Location(file, position);
                    // Cache the result
                    definitionCache.set(symbolName, location);
                    symbolToFileMap.set(symbolName, file.fsPath);
                    return location;
                }
            }
        }
        // Not found: cache empty to avoid re-scanning
        definitionCache.set(symbolName, null);
        return null;
    });
}
function activate(context) {
    const formatOnPaste = vscode.commands.registerCommand("smartPasteIndent.paste", () => __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const config = vscode.workspace.getConfiguration();
        const enabled = config.get("robloxIDE.smartPasteIndent.enabled", true);
        const languageId = editor.document.languageId;
        if (!enabled || (languageId !== "lua" && languageId !== "luau")) {
            yield vscode.commands.executeCommand("editor.action.clipboardPasteAction");
            return;
        }
        const document = editor.document;
        const cursorPos = editor.selection.active;
        const currentLine = document.lineAt(cursorPos.line);
        const lineText = currentLine.text;
        const beforeCursor = lineText.substring(0, cursorPos.character);
        if (beforeCursor == "") {
            // Default behavior of paste when there is no indentation present works fine, so we do nothing special for this case
            yield vscode.commands.executeCommand("editor.action.clipboardPasteAction");
            return;
        }
        // Get clipboard text
        const clipboardText = yield vscode.env.clipboard.readText();
        const pastedLines = clipboardText.split('\n');
        yield vscode.commands.executeCommand('default:paste');
        // Determine smallest indent in pasted content (ignores blank lines)
        let minPastedIndentLength = Number.MAX_SAFE_INTEGER;
        for (const line of pastedLines) {
            if (line.trim().length === 0)
                continue;
            const match = line.match(/^(\s*)/);
            const indent = match ? match[1] : '';
            if (indent.length < minPastedIndentLength) {
                minPastedIndentLength = indent.length;
            }
        }
        if (minPastedIndentLength === Number.MAX_SAFE_INTEGER) {
            minPastedIndentLength = 0; // All lines were blank
        }
        const adjustedLines = pastedLines.map(line => {
            // Remove min indent from each line
            const adjustedLine = line.slice(minPastedIndentLength);
            return adjustedLine;
        });
        const adjustedText = adjustedLines.join('\n');
        yield editor.edit(editBuilder => {
            for (const selection of editor.selections) {
                editBuilder.delete(selection);
            }
        });
        editor.insertSnippet(new vscode.SnippetString(adjustedText), editor.selection.start);
    }));
    context.subscriptions.push(formatOnPaste);
    const cacheClearInterval = setInterval(() => {
        definitionCache.clear();
        symbolToFileMap.clear();
        console.log("[Roblox IDE] Definition cache cleared.");
    }, 3600000); // 1 hour in milliseconds
    context.subscriptions.push({
        dispose: () => clearInterval(cacheClearInterval)
    });
    const provider = {
        provideDefinition(document, position, token) {
            return __awaiter(this, void 0, void 0, function* () {
                const wordRange = document.getWordRangeAtPosition(position);
                if (!wordRange)
                    return;
                const symbolName = document.getText(wordRange);
                const locations = yield findSymbolDefinitionInWorkspace(symbolName);
                return locations;
            });
        }
    };
    context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language: "luau" }, provider));
    const insertFunctionEnd = vscode.commands.registerCommand("roblox.autoInsertFunctionEnd", () => __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const doc = editor.document;
        const pos = editor.selection.active;
        const line = doc.lineAt(pos.line);
        const lineText = line.text;
        const beforeCursor = lineText.substring(0, pos.character);
        const afterCursor = lineText.substring(pos.character);
        const indentMatch = lineText.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : "";
        const currentLine = doc.lineAt(pos.line);
        const nextLine = doc.lineAt(pos.line + 1);
        function countParens(line) {
            const openMatches = line.match(/\(/g);
            const closedMatches = line.match(/\)/g);
            const openMatchesCount = openMatches ? openMatches.length : 0;
            const closedMatchesCount = closedMatches ? closedMatches.length : 0;
            return [openMatchesCount, closedMatchesCount];
        }
        const indentation = getIndentation(editor);
        const [openParensCount, closedParensCount] = countParens(currentLine.text);
        const parenthesesToFill = openParensCount > closedParensCount ? ")".repeat(openParensCount - closedParensCount) : "";
        const afterFunctionParentheses = (openParensCount > 0 && closedParensCount > 0) ? "" : "()";
        yield editor.edit(edit => {
            const fullRange = new vscode.Range(currentLine.range.start, currentLine.range.end);
            let newText = `${beforeCursor}`;
            newText = `${beforeCursor}${afterFunctionParentheses}\n${indent}${indentation}\n${indent}end${parenthesesToFill}`;
            edit.replace(fullRange, newText);
            const nextNextLine = doc.lineAt(pos.line + 1);
            edit.delete(nextNextLine.rangeIncludingLineBreak);
        }, {
            undoStopBefore: true,
            undoStopAfter: true
        });
        if (afterFunctionParentheses) {
            const newCursorPos = new vscode.Position(pos.line, beforeCursor.length + 1); // +1 for '('
            editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
        }
        else {
            const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length);
            editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
        }
    }));
    const insertIfThenEnd = vscode.commands.registerCommand("roblox.autoInsertIfThenEnd", (hasThenAlready) => __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const doc = editor.document;
        const pos = editor.selection.active;
        const line = doc.lineAt(pos.line);
        const lineText = line.text;
        const beforeCursor = lineText.substring(0, pos.character);
        const indentMatch = lineText.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : "";
        const currentLine = doc.lineAt(pos.line);
        let nextLine = doc.lineAt(pos.line + 1);
        yield editor.edit(edit => {
            const fullRange = new vscode.Range(currentLine.range.start, nextLine.range.end);
            const then = hasThenAlready ? "" : "then";
            const indentNextLineMatch = nextLine.text.match(/^(\s*)/);
            const indentNextLine = indentNextLineMatch ? indentNextLineMatch[1] : "";
            const indentToAdd = getIndentation(editor);
            let newText = `${beforeCursor} ${then}\n${indentNextLine}\n${indent}end`;
            if (!hasThenAlready)
                newText = `${beforeCursor} ${then}\n${indentNextLine}${indentToAdd}\n${indent}end`;
            edit.replace(fullRange, newText);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        });
        nextLine = doc.lineAt(pos.line + 1);
        const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length);
        editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
    }));
    const insertDo = vscode.commands.registerCommand("roblox.autoInsertDo", (hasDoAlready) => __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const doc = editor.document;
        const pos = editor.selection.active;
        const line = doc.lineAt(pos.line);
        const lineText = line.text;
        const beforeCursor = lineText.substring(0, pos.character);
        const indentMatch = lineText.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : "";
        const currentLine = doc.lineAt(pos.line);
        let nextLine = doc.lineAt(pos.line + 1);
        yield editor.edit(edit => {
            const fullRange = new vscode.Range(currentLine.range.start, nextLine.range.end);
            const doWord = hasDoAlready ? "" : "do";
            const indentNextLineMatch = nextLine.text.match(/^(\s*)/);
            const indentNextLine = indentNextLineMatch ? indentNextLineMatch[1] : "";
            const indentToAdd = getIndentation(editor);
            let newText = `${beforeCursor} ${doWord}\n${indentNextLine}\n${indent}end`;
            if (!hasDoAlready)
                newText = `${beforeCursor} ${doWord}\n${indentNextLine}${indentToAdd}\n${indent}end`;
            edit.replace(fullRange, newText);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        });
        nextLine = doc.lineAt(pos.line + 1);
        const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length);
        editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
    }));
    const insertUntil = vscode.commands.registerCommand("roblox.autoInsertUntil", () => __awaiter(this, void 0, void 0, function* () {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const doc = editor.document;
        const pos = editor.selection.active;
        const line = doc.lineAt(pos.line);
        const lineText = line.text;
        const beforeCursor = lineText.substring(0, pos.character);
        const indentMatch = lineText.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : "";
        const currentLine = doc.lineAt(pos.line);
        let nextLine = doc.lineAt(pos.line + 1);
        yield editor.edit(edit => {
            const fullRange = new vscode.Range(currentLine.range.start, nextLine.range.end);
            const indentNextLineMatch = nextLine.text.match(/^(\s*)/);
            const indentNextLine = indentNextLineMatch ? indentNextLineMatch[1] : "";
            const indentToAdd = getIndentation(editor);
            let newText = `${beforeCursor}\n${indentNextLine}\n${indent}until`;
            edit.replace(fullRange, newText);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        });
        nextLine = doc.lineAt(pos.line + 1);
        const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length);
        editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
    }));
    context.subscriptions.push(insertFunctionEnd);
    context.subscriptions.push(insertIfThenEnd);
    context.subscriptions.push(insertDo);
    context.subscriptions.push(insertUntil);
    vscode.workspace.onDidChangeTextDocument(event => {
        const changes = event.contentChanges;
        if (changes.length === 0)
            return;
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document)
            return;
        const lastChange = changes[changes.length - 1];
        if (lastChange.text.includes("\n")) {
            // Invalidate Go To Type cache entries on file change
            const changedFilePath = event.document.uri.fsPath;
            for (const [symbolName, filePath] of symbolToFileMap.entries()) {
                if (filePath === changedFilePath) {
                    definitionCache.delete(symbolName);
                    symbolToFileMap.delete(symbolName);
                }
            }
            const position = lastChange.range.start;
            const currentLineText = event.document.lineAt(position.line).text;
            const pos = editor.selection.active;
            const beforeCursor = currentLineText.substring(0, pos.character);
            const matchesFunction = FUNCTION_REGEX.test(beforeCursor);
            if (matchesFunction) {
                if (areScopesFullyClosed(editor.document))
                    return;
                vscode.commands.executeCommand("roblox.autoInsertFunctionEnd");
                return;
            }
            const matchesFor = FOR_REGEX.test(beforeCursor);
            const matchesDo = DO_REGEX.test(beforeCursor);
            const matchesWhile = WHILE_REGEX.test(beforeCursor);
            const matchesIf = IF_REGEX.test(beforeCursor);
            const matchesThen = THEN_REGEX.test(beforeCursor);
            const matchesRepeat = REPEAT_REGEX.test(beforeCursor);
            if (matchesFor || matchesWhile) {
                if (areScopesFullyClosed(editor.document))
                    return;
                vscode.commands.executeCommand("roblox.autoInsertDo", matchesDo);
            }
            else if (matchesIf) {
                if (areScopesFullyClosed(editor.document))
                    return;
                vscode.commands.executeCommand("roblox.autoInsertIfThenEnd", matchesThen);
            }
            else if (matchesRepeat) {
                if (areScopesFullyClosed(editor.document))
                    return;
                vscode.commands.executeCommand("roblox.autoInsertUntil");
            }
        }
    });
    console.log("Roblox IDE activated");
}
//# sourceMappingURL=extension.js.map