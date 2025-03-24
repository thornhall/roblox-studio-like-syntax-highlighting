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
const ELSEIF_REGEX = /\belseif\b/;
const ELSE_REGEX = /\belse\b/;
function countTernaryExpressions(doc) {
    const fullText = doc.getText();
    // Note: currently overmatches on else if statements. However, because else if statements 
    // contribute to the total nesting count, this balances out perfectly as we will now subtract them here. 
    const matches = fullText.match(/(\=\s*if\b)|(\bthen\s*\n*\s*if\b)|(\belse\s*\n*\s*if\b)/g) || [];
    return matches.length;
}
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
    let fullyClosed = false;
    const numTernaries = countTernaryExpressions(doc);
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
    nesting -= numTernaries; // if statements in a ternary statement do not require a closing end 
    if (nesting === 0) {
        fullyClosed = true;
    }
    return [nesting, fullyClosed];
}
function validateScopeClosureBeforeEdit(doc) {
    const [nestingLevel, areScopesClosed] = areScopesFullyClosed(doc);
    const config = vscode.workspace.getConfiguration();
    const enabled = config.get("robloxIDE.showWarnings.enabled", true);
    if (!enabled)
        return areScopesClosed;
    if (nestingLevel < 0) {
        vscode.window.showWarningMessage("Auto-insert detected that your file has too many \`end\` statements.");
    }
    else if (nestingLevel > 1) {
        vscode.window.showWarningMessage("Auto-insert detected that your file does not have enough \`end`\ statements");
    }
    return areScopesClosed;
}
const definitionCache = new Map();
const filePathToSymbols = new Map();
async function findSymbolDefinitionInWorkspace(symbolName, token) {
    if (definitionCache.has(symbolName)) {
        return definitionCache.get(symbolName);
    }
    const files = await vscode.workspace.findFiles("**/*.{lua,luau}", "**/node_modules/**", undefined, token);
    // Escape symbolName to safely insert into regex
    const escapedSymbol = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexPatterns = [
        new RegExp(`\\b(export\\s+)?type\\s+${escapedSymbol}\\b`), // type declaration
        new RegExp(`function\\s+[A-Za-z_][A-Za-z0-9_]*\\:${escapedSymbol}\\s*\\(`), // class method
    ];
    for (const file of files) {
        if (token.isCancellationRequested)
            return null;
        const document = await vscode.workspace.openTextDocument(file);
        const lineCount = document.lineCount;
        for (let i = 0; i < lineCount; i++) {
            const line = document.lineAt(i);
            const lineText = line.text;
            for (const regex of regexPatterns) {
                if (token.isCancellationRequested)
                    return null;
                const match = regex.exec(lineText);
                if (match) {
                    const matchPosition = line.range.start.translate(0, match.index);
                    const location = new vscode.Location(file, matchPosition);
                    definitionCache.set(symbolName, location);
                    let symbolSet = filePathToSymbols.get(file.fsPath);
                    if (!symbolSet) {
                        symbolSet = new Set();
                        filePathToSymbols.set(file.fsPath, symbolSet);
                    }
                    symbolSet.add(symbolName);
                    return location;
                }
            }
        }
    }
    definitionCache.set(symbolName, null);
    return null;
}
function createGoToDefinitionProvider() {
    const provider = {
        async provideDefinition(document, position, token) {
            const wordRange = document.getWordRangeAtPosition(position);
            if (!wordRange)
                return;
            const symbolName = document.getText(wordRange);
            const locations = await findSymbolDefinitionInWorkspace(symbolName, token);
            return locations;
        }
    };
    return provider;
}
function createFormatOnPasteCommand() {
    const formatOnPaste = vscode.commands.registerCommand("smartPasteIndent.paste", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const config = vscode.workspace.getConfiguration();
        const enabled = config.get("robloxIDE.smartPasteIndent.enabled", true);
        const languageId = editor.document.languageId;
        if (!enabled || (languageId !== "lua" && languageId !== "luau")) {
            await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
            return;
        }
        const document = editor.document;
        const cursorPos = editor.selection.active;
        const currentLine = document.lineAt(cursorPos.line);
        const lineText = currentLine.text;
        const beforeCursor = lineText.substring(0, cursorPos.character);
        if (beforeCursor == "") {
            // Default behavior of paste when there is no indentation present works fine, so we do nothing special for this case
            await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
            return;
        }
        // Get clipboard text
        const clipboardText = await vscode.env.clipboard.readText();
        const pastedLines = clipboardText.split("\n");
        await vscode.commands.executeCommand("default:paste");
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
        const adjustedText = adjustedLines.join("\n");
        await editor.edit(editBuilder => {
            for (const selection of editor.selections) {
                editBuilder.delete(selection);
            }
        });
        editor.insertSnippet(new vscode.SnippetString(adjustedText), editor.selection.start);
    });
    return formatOnPaste;
}
function createAutoInsertFunctionEndCommand() {
    const insertFunctionEnd = vscode.commands.registerCommand("roblox.autoInsertFunctionEnd", async () => {
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
        await editor.edit(edit => {
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
    });
    return insertFunctionEnd;
}
function createAutoInsertIfThenCommand() {
    const insertIfThenEnd = vscode.commands.registerCommand("roblox.autoInsertIfThenEnd", async (hasThenAlready, isElse, isElseIf) => {
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
        await editor.edit(edit => {
            const fullRange = new vscode.Range(currentLine.range.start, nextLine.range.end);
            const then = hasThenAlready || (isElse && !isElseIf) ? "" : "then";
            const indentNextLineMatch = nextLine.text.match(/^(\s*)/);
            const indentNextLine = indentNextLineMatch ? indentNextLineMatch[1] : "";
            const indentToAdd = getIndentation(editor);
            let newText = `${beforeCursor} ${then}\n${indentNextLine}\n${indent}end`;
            if (!hasThenAlready && !isElse)
                newText = `${beforeCursor} ${then}\n${indentNextLine}${indentToAdd}\n${indent}end`;
            edit.replace(fullRange, newText);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        });
        nextLine = doc.lineAt(pos.line + 1);
        const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length);
        editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
    });
    return insertIfThenEnd;
}
function createAutoInsertDoCommand() {
    const insertDo = vscode.commands.registerCommand("roblox.autoInsertDo", async (hasDoAlready) => {
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
        await editor.edit(edit => {
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
    });
    return insertDo;
}
function createAutoInsertUntilCommand() {
    const insertUntil = vscode.commands.registerCommand("roblox.autoInsertUntil", async () => {
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
        await editor.edit(edit => {
            const fullRange = new vscode.Range(currentLine.range.start, nextLine.range.end);
            const indentNextLineMatch = nextLine.text.match(/^(\s*)/);
            const indentNextLine = indentNextLineMatch ? indentNextLineMatch[1] : "";
            let newText = `${beforeCursor}\n${indentNextLine}\n${indent}until`;
            edit.replace(fullRange, newText);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        });
        nextLine = doc.lineAt(pos.line + 1);
        const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length);
        editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
    });
    return insertUntil;
}
function activate(context) {
    const definitionProvider = createGoToDefinitionProvider();
    const insertFunctionEnd = createAutoInsertFunctionEndCommand();
    const insertIfThenEnd = createAutoInsertIfThenCommand();
    const insertDo = createAutoInsertDoCommand();
    const insertUntil = createAutoInsertUntilCommand();
    const formatOnPaste = createFormatOnPasteCommand();
    // Cache clearing every 10 minutes (600,000 ms)
    const cacheClearInterval = setInterval(() => {
        definitionCache.clear();
        filePathToSymbols.clear();
        console.log("Roblox IDE: Cleared symbol definition cache.");
    }, 30 * 60 * 1000); // 30 min
    context.subscriptions.push({ dispose: () => clearInterval(cacheClearInterval) });
    context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language: "luau" }, definitionProvider));
    context.subscriptions.push(insertFunctionEnd);
    context.subscriptions.push(insertIfThenEnd);
    context.subscriptions.push(insertDo);
    context.subscriptions.push(insertUntil);
    context.subscriptions.push(formatOnPaste);
    vscode.workspace.onDidChangeTextDocument(async (event) => {
        const changes = event.contentChanges;
        if (changes.length === 0)
            return;
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document)
            return;
        const lastChange = changes[changes.length - 1];
        if (lastChange.text.includes("\n")) {
            // Invalidate Go To Definition cache entries on file change
            const changedFilePath = event.document.uri.fsPath;
            const symbols = filePathToSymbols.get(changedFilePath);
            if (symbols) {
                for (const symbolName of symbols) {
                    definitionCache.delete(symbolName);
                }
                filePathToSymbols.delete(changedFilePath);
            }
            const position = lastChange.range.start;
            const currentLine = event.document.lineAt(position.line);
            const currentLineText = currentLine.text;
            const pos = editor.selection.active;
            const beforeCursor = currentLineText.substring(0, pos.character);
            const matchesFunction = FUNCTION_REGEX.test(beforeCursor);
            const matchesFor = FOR_REGEX.test(beforeCursor);
            const matchesDo = DO_REGEX.test(beforeCursor);
            const matchesWhile = WHILE_REGEX.test(beforeCursor);
            const matchesIf = IF_REGEX.test(beforeCursor);
            const matchesThen = THEN_REGEX.test(beforeCursor);
            const matchesRepeat = REPEAT_REGEX.test(beforeCursor);
            const matchesElseIf = ELSEIF_REGEX.test(beforeCursor);
            const matchesElse = ELSE_REGEX.test(beforeCursor);
            if (matchesFunction) {
                if (validateScopeClosureBeforeEdit(event.document))
                    return;
                vscode.commands.executeCommand("roblox.autoInsertFunctionEnd");
            }
            else if (matchesFor || matchesWhile) {
                if (validateScopeClosureBeforeEdit(event.document))
                    return;
                vscode.commands.executeCommand("roblox.autoInsertDo", matchesDo);
            }
            else if (matchesIf || matchesElseIf || matchesElse) {
                if (validateScopeClosureBeforeEdit(event.document))
                    return;
                vscode.commands.executeCommand("roblox.autoInsertIfThenEnd", matchesThen, matchesElse, matchesElseIf);
            }
            else if (matchesRepeat) {
                if (validateScopeClosureBeforeEdit(event.document))
                    return;
                vscode.commands.executeCommand("roblox.autoInsertUntil");
            }
        }
    });
    console.log("Roblox IDE activated");
}
//# sourceMappingURL=extension.js.map