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
        if (END_REGEX.test(lineText))
            nesting--;
    }
    if (nesting === 0) {
        return true;
    }
    return false;
}
const typeDefinitionCache = new Map();
const typeToFileMap = new Map();
function findTypeDefinitionInWorkspace(typeName) {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeDefinitionCache.has(typeName)) {
            return typeDefinitionCache.get(typeName);
        }
        const files = yield vscode.workspace.findFiles('**/*.{lua,luau}', '**/node_modules/**');
        const regex = new RegExp(`\\b(export\\s+)?type\\s+${typeName}\\b`);
        for (const file of files) {
            const document = yield vscode.workspace.openTextDocument(file);
            const text = document.getText();
            const match = regex.exec(text);
            if (match) {
                const index = match.index;
                const position = document.positionAt(index);
                const location = new vscode.Location(file, position);
                // Cache result
                typeDefinitionCache.set(typeName, [location]);
                typeToFileMap.set(typeName, file.fsPath);
                return [location];
            }
        }
        // Not found: cache empty result to avoid repeated scanning
        typeDefinitionCache.set(typeName, []);
        return [];
    });
}
function activate(context) {
    const provider = {
        provideDefinition(document, position, token) {
            return __awaiter(this, void 0, void 0, function* () {
                const wordRange = document.getWordRangeAtPosition(position);
                if (!wordRange)
                    return;
                const typeName = document.getText(wordRange);
                const locations = yield findTypeDefinitionInWorkspace(typeName);
                return locations;
            });
        }
    };
    context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language: 'luau' }, provider));
    const insertFunctionEnd = vscode.commands.registerCommand('roblox.autoInsertFunctionEnd', (hasParenthesesAlready) => __awaiter(this, void 0, void 0, function* () {
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
        yield editor.edit(edit => {
            const fullRange = new vscode.Range(currentLine.range.start, nextLine.range.end);
            const parentheses = hasParenthesesAlready ? "" : "()";
            let newText = `${beforeCursor}${parentheses}\n${nextLine.text}\n${indent}end${afterCursor}`;
            if (nextLine.text.includes(")")) {
                const afterText = ")";
                const indentNextLineMatch = nextLine.text.match(/^(\s*)/);
                const indentNextLine = indentNextLineMatch ? indentNextLineMatch[1] : "";
                const indentToAdd = getIndentation(editor);
                newText = `${beforeCursor}${parentheses}\n${indentNextLine}${indentToAdd}\n${indent}end${afterText}`;
            }
            edit.replace(fullRange, newText);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        });
        if (!hasParenthesesAlready) {
            const newCursorPos = new vscode.Position(pos.line, beforeCursor.length + 1); // +1 for '('
            editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
        }
        else {
            const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length);
            editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
        }
    }));
    const insertIfThenEnd = vscode.commands.registerCommand('roblox.autoInsertIfThenEnd', (hasThenAlready) => __awaiter(this, void 0, void 0, function* () {
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
    const insertDo = vscode.commands.registerCommand('roblox.autoInsertDo', (hasDoAlready) => __awaiter(this, void 0, void 0, function* () {
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
    context.subscriptions.push(insertFunctionEnd);
    context.subscriptions.push(insertIfThenEnd);
    context.subscriptions.push(insertDo);
    vscode.workspace.onDidChangeTextDocument(event => {
        const changes = event.contentChanges;
        if (changes.length === 0)
            return;
        // Invalidate Go To Type cache entries on file change
        const changedFilePath = event.document.uri.fsPath;
        for (const [typeName, filePath] of typeToFileMap.entries()) {
            if (filePath === changedFilePath) {
                typeDefinitionCache.delete(typeName);
                typeToFileMap.delete(typeName);
            }
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document)
            return;
        const lastChange = changes[changes.length - 1];
        if (lastChange.text.includes("\n")) {
            const position = lastChange.range.start;
            const currentLineText = event.document.lineAt(position.line).text;
            const pos = editor.selection.active;
            const beforeCursor = currentLineText.substring(0, pos.character);
            let hasParentheses = false;
            if (beforeCursor.includes("(") && beforeCursor.includes(")"))
                hasParentheses = true;
            const matchesFunction = FUNCTION_REGEX.test(beforeCursor);
            if (matchesFunction) {
                if (areScopesFullyClosed(editor.document))
                    return;
                vscode.commands.executeCommand('roblox.autoInsertFunctionEnd', hasParentheses);
                return;
            }
            const matchesFor = FOR_REGEX.test(beforeCursor);
            const matchesDo = DO_REGEX.test(beforeCursor);
            const matchesWhile = WHILE_REGEX.test(beforeCursor);
            const matchesIf = IF_REGEX.test(beforeCursor);
            const matchesThen = THEN_REGEX.test(beforeCursor);
            if (matchesFor || matchesWhile) {
                if (areScopesFullyClosed(editor.document))
                    return;
                vscode.commands.executeCommand('roblox.autoInsertDo', matchesDo);
            }
            else if (matchesIf) {
                if (areScopesFullyClosed(editor.document))
                    return;
                vscode.commands.executeCommand('roblox.autoInsertIfThenEnd', matchesThen);
            }
        }
    });
}
//# sourceMappingURL=extension.js.map