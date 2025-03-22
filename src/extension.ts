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

// const typeDefinitionCache: Map<string, vscode.Location[]> = new Map();
// const typeToFileMap: Map<string, string> = new Map();
// async function findTypeDefinitionInWorkspace(typeName: string): Promise<vscode.Location[]> {
//     if (typeDefinitionCache.has(typeName)) {
//         return typeDefinitionCache.get(typeName)!;
//     }

//     const files = await vscode.workspace.findFiles('**/*.{lua,luau}', '**/node_modules/**');
//     const regex = new RegExp(`\\b(export\\s+)?type\\s+${typeName}\\b`);

//     for (const file of files) {
//         const document = await vscode.workspace.openTextDocument(file);
//         const text = document.getText();
//         const match = regex.exec(text);

//         if (match) {
//             const index = match.index;
//             const position = document.positionAt(index);
//             const location = new vscode.Location(file, position);

//             // Cache result
//             typeDefinitionCache.set(typeName, [location]);
//             typeToFileMap.set(typeName, file.fsPath);

//             return [location];
//         }
//     }

//     // Not found: cache empty result to avoid repeated scanning
//     typeDefinitionCache.set(typeName, []);
//     return [];
// }

const definitionCache: Map<string, vscode.Location[]> = new Map();
const symbolToFileMap: Map<string, string> = new Map();
async function findSymbolDefinitionInWorkspace(symbolName: string): Promise<vscode.Location[]> {
    if (definitionCache.has(symbolName)) {
        return definitionCache.get(symbolName)!;
    }

    const files = await vscode.workspace.findFiles('**/*.{lua,luau}', '**/node_modules/**');

    const regexPatterns = [
        new RegExp(`\\b(export\\s+)?type\\s+${symbolName}\\b`),                          // type declaration
        new RegExp(`function\\s+${symbolName}\\s*\\(`),                                  // global function
        new RegExp(`local\\s+function\\s+${symbolName}\\s*\\(`),                         // local function
        new RegExp(`${symbolName}\\s*=\\s*function\\s*\\(`),                             // assignment function
        new RegExp(`function\\s+[A-Za-z_][A-Za-z0-9_]*\\:${symbolName}\\s*\\(`),         // class method
        new RegExp(`function\\s+[A-Za-z_][A-Za-z0-9_]*\\.${symbolName}\\s*\\(`)          // static method
    ];

    for (const file of files) {
        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();

        for (const regex of regexPatterns) {
            const match = regex.exec(text);
            if (match) {
                const index = match.index;
                const position = document.positionAt(index);
                const location = new vscode.Location(file, position);

                // Cache the result
                definitionCache.set(symbolName, [location]);
                symbolToFileMap.set(symbolName, file.fsPath);

                return [location];
            }
        }
    }

    // Not found: cache empty to avoid re-scanning
    definitionCache.set(symbolName, []);
    return [];
}


export function activate(context: vscode.ExtensionContext) {

    const cacheClearInterval = setInterval(() => {
        definitionCache.clear();
        symbolToFileMap.clear();
        console.log("[Roblox IDE] Definition cache cleared.");
    }, 3600000); // 1 hour in milliseconds

    context.subscriptions.push({
        dispose: () => clearInterval(cacheClearInterval)
    });

    const provider: vscode.DefinitionProvider = {
        async provideDefinition(document, position, token) {
            const wordRange = document.getWordRangeAtPosition(position);
            if (!wordRange) return;

            const symbolName = document.getText(wordRange);
            const locations = await findSymbolDefinitionInWorkspace(symbolName);
            return locations;
        }
    };

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider({ language: 'luau' }, provider)
    );

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

        // Invalidate Go To Type cache entries on file change
        const changedFilePath = event.document.uri.fsPath;
        for (const [symbolName, filePath] of symbolToFileMap.entries()) {
            if (filePath === changedFilePath) {
                definitionCache.delete(symbolName);
                symbolToFileMap.delete(symbolName);
            }
        }
        
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