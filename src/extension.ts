import * as vscode from 'vscode';

const FUNCTION_REGEX = /\bfunction\b/
const END_REGEX = /\bend\b/
const DO_REGEX = /\bdo\b/
const IF_REGEX = /\bif\b/
const THEN_REGEX = /\bthen\b/
const FOR_REGEX = /\bfor\b/
const WHILE_REGEX = /\bwhile\b/

function getIndentation(editor: vscode.TextEditor): string {
    const insertSpaces = editor.options.insertSpaces === true;
    const tabSize = Number(editor.options.tabSize);

    if (insertSpaces) {
        return ' '.repeat(tabSize); 
    } else {
        return '\t';
    }
}

function stripCommentsAndStrings(line: string): string {
    // Remove strings (handles both "..." and '...')
    let noStrings = line.replace(/(['"]).*?\1/g, "");

    // Remove single-line comments
    noStrings = noStrings.replace(/--.*/, "");

    return noStrings;
}

function isMultilineCommentStart(lineText: string): boolean {
    return /--\[\[/.test(lineText);
}

function isMultilineCommentEnd(lineText: string): boolean {
    return /\]\]/.test(lineText);
}

function areScopesFullyClosed(doc: vscode.TextDocument): boolean {
    let nesting = 0;
    let insideMultilineComment = false

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

        lineText = stripCommentsAndStrings(lineText)

        if (FUNCTION_REGEX.test(lineText)) nesting++
        if (WHILE_REGEX.test(lineText)) nesting++
        if (FOR_REGEX.test(lineText)) nesting++
        if (IF_REGEX.test(lineText)) nesting++
        if (END_REGEX.test(lineText)) nesting--
    }
    if (nesting === 0) {
        return true;
    }
    return false; 
}

export function activate(context: vscode.ExtensionContext) {
    const insertFunctionEnd = vscode.commands.registerCommand('roblox.autoInsertFunctionEnd', async (hasParenthesesAlready: boolean) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
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

        await editor.edit(edit => {
            const fullRange = new vscode.Range(currentLine.range.start, nextLine.range.end);
            const parentheses = hasParenthesesAlready ? "" : "()";
            let newText = `${beforeCursor}${parentheses}\n${nextLine.text}\n${indent}end${afterCursor}`;

            if (nextLine.text.includes(")")) {
                const afterText = ")"
                const indentNextLineMatch = nextLine.text.match(/^(\s*)/);
                const indentNextLine = indentNextLineMatch ? indentNextLineMatch[1] : ""
                const indentToAdd = getIndentation(editor)
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
        } else {
            const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length)
            editor.selection = new vscode.Selection(newCursorPos, newCursorPos)
        }
    });


    const insertIfThenEnd = vscode.commands.registerCommand('roblox.autoInsertIfThenEnd', async (hasThenAlready: boolean) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

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
            const then = hasThenAlready ? "" : "then";

            const indentNextLineMatch = nextLine.text.match(/^(\s*)/);
            const indentNextLine = indentNextLineMatch ? indentNextLineMatch[1] : ""
            const indentToAdd = getIndentation(editor)
    
            let newText = `${beforeCursor} ${then}\n${indentNextLine}\n${indent}end`;
            if (!hasThenAlready) newText = `${beforeCursor} ${then}\n${indentNextLine}${indentToAdd}\n${indent}end`;

            edit.replace(fullRange, newText);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        });

        nextLine = doc.lineAt(pos.line + 1);

        const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length)
        editor.selection = new vscode.Selection(newCursorPos, newCursorPos)
    });

    const insertDo = vscode.commands.registerCommand('roblox.autoInsertDo', async (hasDoAlready: boolean) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

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
            const indentNextLine = indentNextLineMatch ? indentNextLineMatch[1] : ""
            const indentToAdd = getIndentation(editor)

            let newText = `${beforeCursor} ${doWord}\n${indentNextLine}\n${indent}end`;
            if (!hasDoAlready) newText = `${beforeCursor} ${doWord}\n${indentNextLine}${indentToAdd}\n${indent}end`;

            edit.replace(fullRange, newText);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        });

        nextLine = doc.lineAt(pos.line + 1);

        const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length)
        editor.selection = new vscode.Selection(newCursorPos, newCursorPos)
    });

    context.subscriptions.push(insertFunctionEnd);
    context.subscriptions.push(insertIfThenEnd);
    context.subscriptions.push(insertDo);

    vscode.workspace.onDidChangeTextDocument(event => {
        const changes = event.contentChanges;
        if (changes.length === 0) return;
        
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document) return;

        const lastChange = changes[changes.length - 1];

        if (lastChange.text.includes("\n")) {
            const position = lastChange.range.start;
            const currentLineText = event.document.lineAt(position.line).text
            const pos = editor.selection.active;
            const beforeCursor = currentLineText.substring(0, pos.character);

            let hasParentheses = false 
            if (beforeCursor.includes("(") && beforeCursor.includes(")")) hasParentheses = true
            const matchesFunction = FUNCTION_REGEX.test(beforeCursor)
            if (matchesFunction) {
                if (areScopesFullyClosed(editor.document)) return 
                vscode.commands.executeCommand('roblox.autoInsertFunctionEnd', hasParentheses);
                return
            }

            const matchesFor = FOR_REGEX.test(beforeCursor)
            const matchesDo = DO_REGEX.test(beforeCursor)
            const matchesWhile = WHILE_REGEX.test(beforeCursor)
            const matchesIf = IF_REGEX.test(beforeCursor)
            const matchesThen = THEN_REGEX.test(beforeCursor)

            if (matchesFor || matchesWhile) {
                if (areScopesFullyClosed(editor.document)) return
                vscode.commands.executeCommand('roblox.autoInsertDo', matchesDo);
            } else if (matchesIf) {
                if (areScopesFullyClosed(editor.document)) return 
                vscode.commands.executeCommand('roblox.autoInsertIfThenEnd', matchesThen);
            }
        }
    });
}