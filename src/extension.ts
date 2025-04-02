import * as vscode from 'vscode';
import * as path from "path";
import * as fs from "fs";
import RoactParser from './models/RoactParser';
const roactParser:RoactParser = new RoactParser()
const FUNCTION_REGEX = /\bfunction\b/
const END_REGEX = /\bend\b/
const DO_REGEX = /\bdo\b/
const IF_REGEX = /\bif\b/
const THEN_REGEX = /\bthen\b/
const FOR_REGEX = /\bfor\b/
const WHILE_REGEX = /\bwhile\b/
const REPEAT_REGEX = /\brepeat\b/
const UNTIL_REGEX = /\buntil\b/
const ELSEIF_REGEX_ALL = /\belse\s*if\b/
const ELSEIF_REGEX_SPACE = /\belse\s+if\b/
const ELSE_REGEX = /\belse\b/
const CLASS_REGEX = /\bfunction\b\s+(\w+)\.new\s*\(?\)?$/

function countTernaryExpressions(doc: vscode.TextDocument): number {
    const fullText = doc.getText();
    const matches = fullText.match(/(\=\s*\n*\s*\bif\b)/g) || [];
    return matches.length
}

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

function areScopesFullyClosed(doc: vscode.TextDocument): [number, boolean] {
    let nesting = 0;
    let insideMultilineComment = false
    let fullyClosed = false

    const numTernaries = countTernaryExpressions(doc)

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
        if (ELSEIF_REGEX_SPACE.test(lineText)) {
            nesting-- // account for "else if" matching with IF_REGEX but not requiring another end
        }
        if (REPEAT_REGEX.test(lineText)) nesting++
        if (UNTIL_REGEX.test(lineText)) nesting--
        if (END_REGEX.test(lineText)) nesting--
    }
    nesting -= numTernaries // if statements in a ternary statement do not require a closing end 
    if (nesting === 0) {
        fullyClosed = true;
    }
    return [nesting, fullyClosed]
}

function validateScopeClosureBeforeEdit(doc: vscode.TextDocument): boolean {
    const [nestingLevel, areScopesClosed] = areScopesFullyClosed(doc)
    const config = vscode.workspace.getConfiguration();
    const enabled = config.get<boolean>("robloxIDE.showWarnings.enabled", true);
    if (!enabled) return areScopesClosed
    if (nestingLevel < 0) {
        vscode.window.showWarningMessage("Auto-insert detected that your file has too many \`end\` statements.")
    } else if (nestingLevel > 1) {
        vscode.window.showWarningMessage("Auto-insert detected that your file does not have enough \`end`\ statements")
    }
    return areScopesClosed
}

const definitionCache: Map<string, vscode.Location | null> = new Map();
const filePathToSymbols = new Map<string, Set<string>>();
async function findSymbolDefinitionInWorkspace(symbolName: string, token: vscode.CancellationToken): Promise<vscode.Location | null> {
    if (definitionCache.has(symbolName)) {
        return definitionCache.get(symbolName)!;
    }

    const files = await vscode.workspace.findFiles("**/*.{lua,luau}", "**/node_modules/**", undefined, token);

    // Escape symbolName to safely insert into regex
    const escapedSymbol = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexPatterns = [
        new RegExp(`\\b(export\\s+)?type\\s+${escapedSymbol}\\b`),                          // type declaration
        new RegExp(`function\\s+[A-Za-z_][A-Za-z0-9_]*\\:${escapedSymbol}\\s*\\(`),         // class method
    ];

    for (const file of files) {
        if (token.isCancellationRequested) return null;
        const document = await vscode.workspace.openTextDocument(file);
        const lineCount = document.lineCount;

        for (let i = 0; i < lineCount; i++) {
            const line = document.lineAt(i);
            const lineText = line.text;

            for (const regex of regexPatterns) {
                if (token.isCancellationRequested) return null;
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

function createGoToDefinitionProvider(): vscode.DefinitionProvider {
    const provider: vscode.DefinitionProvider = {
        async provideDefinition(document, position, token) {
            const wordRange = document.getWordRangeAtPosition(position);
            if (!wordRange) return;

            const symbolName = document.getText(wordRange);
            const locations = await findSymbolDefinitionInWorkspace(symbolName, token);
            return locations;
        }
    };
    return provider
}

function createFormatOnPasteCommand(): vscode.Disposable {
    const formatOnPaste = vscode.commands.registerCommand("smartPasteIndent.paste", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const config = vscode.workspace.getConfiguration();
        const enabled = config.get<boolean>("robloxIDE.smartPasteIndent.enabled", true);

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
            if (line.trim().length === 0) continue;
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
            const adjustedLine = line.slice(minPastedIndentLength)
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
    return formatOnPaste
}

function createAutoInsertFunctionEndCommand(): vscode.Disposable {
    const insertFunctionEnd = vscode.commands.registerCommand("roblox.autoInsertFunctionEnd", async () => {
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
        const nextLine = doc.lineAt(pos.line + 1);

        function countParens(line: string): [number, number] {
            const openMatches = line.match(/\(/g);
            const closedMatches = line.match(/\)/g);
            const openMatchesCount = openMatches ? openMatches.length : 0;
            const closedMatchesCount = closedMatches ? closedMatches.length : 0;
            return [openMatchesCount, closedMatchesCount]
        }

        const indentation = getIndentation(editor)

        const [openParensCount, closedParensCount] = countParens(currentLine.text)
        const parenthesesToFill = openParensCount > closedParensCount ? ")".repeat(openParensCount - closedParensCount) : ""
        const afterFunctionParentheses = (openParensCount > 0 && closedParensCount > 0) ? "" : "()"

        await editor.edit(edit => {
            const fullRange = new vscode.Range(currentLine.range.start, currentLine.range.end);

            let newText = `${beforeCursor}`;
            newText = `${beforeCursor}${afterFunctionParentheses}\n${indent}${indentation}\n${indent}end${parenthesesToFill}`;

            edit.replace(fullRange, newText);

            const nextNextLine = doc.lineAt(pos.line + 1)
            edit.delete(nextNextLine.rangeIncludingLineBreak)
        }, {
            undoStopBefore: true,
            undoStopAfter: true
        });

        if (afterFunctionParentheses) {
            const newCursorPos = new vscode.Position(pos.line, beforeCursor.length + 1); // +1 for '('
            editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
        } else {
            const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length)
            editor.selection = new vscode.Selection(newCursorPos, newCursorPos)
        }
    });
    return insertFunctionEnd
}

function createAutoInsertIfThenCommand(): vscode.Disposable {
    const insertIfThenEnd = vscode.commands.registerCommand("roblox.autoInsertIfThenEnd", async (hasThenAlready: boolean, isElse: boolean, isElseIf: boolean, areAllScopesClosed: boolean) => {
        if (areAllScopesClosed && hasThenAlready) return
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
            const then = hasThenAlready || (isElse && !isElseIf) ? "" : "then";

            const indentNextLineMatch = nextLine.text.match(/^(\s*)/);
            const indentNextLine = indentNextLineMatch ? indentNextLineMatch[1] : ""
            const indentToAdd = getIndentation(editor)

            let newText = `${beforeCursor} ${then}\n${indentNextLine}\n${indent}end`;
            if (!hasThenAlready && !isElse) newText = `${beforeCursor} ${then}\n${indentNextLine}${indentToAdd}\n${indent}end`;

            if (isElseIf && areAllScopesClosed) {
                // edge case: we need to fill in the "then" for "elseif" but "end" is already there
                newText = `${beforeCursor} ${then}\n${indentToAdd}`
            }

            edit.replace(fullRange, newText);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        });

        nextLine = doc.lineAt(pos.line + 1);

        const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length)
        editor.selection = new vscode.Selection(newCursorPos, newCursorPos)
    });
    return insertIfThenEnd
}

function createClassAutoComplete(): vscode.Disposable {
    const autoCompleteClass = vscode.commands.registerCommand("roblox.autoCompleteClass", async (classCapture: RegExpMatchArray) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const doc = editor.document;
        const pos = editor.selection.active;
        const line = doc.lineAt(pos.line);
        let nextLine = doc.lineAt(pos.line + 1);

        await editor.edit(edit => {
            const name = classCapture?.[1];
            if (name) {
                const fullRange = new vscode.Range(line.range.start, nextLine.range.end);

                const newText = `local ${name} = {}
${name}.__index = ${name}

function ${name}.new()
  local self = setmetatable({}, ${name})
  return self
end

return ${name}`
                edit.replace(fullRange, newText);
            }
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        });
    })
    return autoCompleteClass
}

function createAutoCompleteRoact(): vscode.Disposable {
    const autoCompleteRoact = vscode.commands.registerCommand("roblox.autoCompleteRoact", async (snippetString: string) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const doc = editor.document;
        const pos = editor.selection.active;
        const line = doc.lineAt(pos.line);
        const currentLineText = line.text;
        const indentMatch = currentLineText.match(/^(\s*)/);
        const indentString = indentMatch ? indentMatch[1] : "";
        const indentLevel = Math.floor(indentString.length / 4); // or .length if using tabs

        const matchStart = currentLineText.indexOf(snippetString);
        if (matchStart === -1) return;

        const matchEnd = matchStart + snippetString.length;

        const rangeToReplace = new vscode.Range(
            new vscode.Position(pos.line, matchStart),
            new vscode.Position(pos.line, matchEnd)
        );

        roactParser.parse(currentLineText);
        const snippet = roactParser.toSnippet(indentLevel);

        await editor.edit(edit => {
            edit.replace(rangeToReplace, snippet);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        });
    });

    return autoCompleteRoact;
}

function createAutoInsertDoCommand(): vscode.Disposable {
    const insertDo = vscode.commands.registerCommand("roblox.autoInsertDo", async (hasDoAlready: boolean) => {
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
    return insertDo
}

function createAutoInsertUntilCommand(): vscode.Disposable {
    const insertUntil = vscode.commands.registerCommand("roblox.autoInsertUntil", async () => {
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
            const indentNextLineMatch = nextLine.text.match(/^(\s*)/);
            const indentNextLine = indentNextLineMatch ? indentNextLineMatch[1] : ""

            let newText = `${beforeCursor}\n${indentNextLine}\n${indent}until`;

            edit.replace(fullRange, newText);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        });

        nextLine = doc.lineAt(pos.line + 1);

        const newCursorPos = new vscode.Position(pos.line + 1, nextLine.text.length)
        editor.selection = new vscode.Selection(newCursorPos, newCursorPos)
    });
    return insertUntil
}

// Returns true if one of the ancestor directories is a Roblox directory
function validateParentDirectory(fsPath: string): [boolean, string?] {
    let currentDir = fsPath;

    const validDirNames = [
        "ServerStorage",
        "ReplicatedStorage",
        "StarterPlayer",
        "Workspace",
        "StarterGui",
        "StarterPlayer",
        "ServerScriptService"
    ]
    // Loop through parent directories until the root
    while (currentDir !== path.parse(currentDir).root) {
        const parentDirName = path.basename(currentDir);

        console.log(parentDirName)
        if (validDirNames.includes(parentDirName)) {
            return [true, parentDirName]
        }
        // Move up one directory
        currentDir = path.dirname(currentDir);
    }
    const message = "Location is not parented by a valid Roblox directory"
    vscode.window.showErrorMessage(`Unable to create ModuleScript: ${message}`);
    return [false, undefined];
}

// When user creates a new file via clicking a directory, we don't have a reference file to duplicate.
// So we must create a new one, but what extension do we give it? This function returns the appropriate extension
// Depending on the roblox service the folder is contained within
function getFileExtensionForNewFile(fsPath: string): string | undefined {
    const serverLua = [
        ".server.lua",
        "ServerStorage",
        "ServerScriptService"
    ]

    const clientLua = [
        ".client.lua",
        "StarterPlayer",
        "StarterGui",
        "StarterPlayer",
    ]

    const normalLua = [
        ".lua",
        "ReplicatedStorage",
        "Workspace"
    ]

    const dirTypes = [serverLua, clientLua, normalLua]

    const [_, parentDirMatch] = validateParentDirectory(fsPath)
    if (!parentDirMatch) return undefined

    for (const dirType of dirTypes) {
        for (const parentDir of dirType) {
            if (parentDirMatch === parentDir) {
                return dirType[0]
            }
        }
    }
    return undefined
}


function isDirectory(fsPath: string) {
    try {
        const stats = fs.statSync(fsPath);
        return stats.isDirectory()
    } catch (err) {
        console.error("Error checking file path:", err);
        throw new Error(`Invalid path: ${fsPath}`);
    }
}

function getDirectoryPath(fsPath: string): string {
    try {
        const stats = fs.statSync(fsPath);

        if (stats.isDirectory()) {
            // If it's a directory, return as is
            return fsPath;
        } else {
            // If it's not a directory, get the parent directory
            return path.dirname(fsPath);
        }
    } catch (err) {
        console.error("Error checking file path:", err);
        throw new Error(`Invalid path: ${fsPath}`);
    }
}

// Function to get the correct extension
function getCustomExtension(filePath: string): string {
    if (filePath.endsWith(".client.lua")) {
        return ".client.lua";
    }
    if (filePath.endsWith(".server.lua")) {
        return ".server.lua";
    }
    return ".lua"; // Default to .lua if no custom extension
}

// Get the correct base name while keeping custom extensions
function getModuleName(uri: vscode.Uri): string {
    const filePath = uri.fsPath;
    const customExtension = getCustomExtension(filePath);
    // Remove the full extension (including .client.lua or .server.lua)
    return path.basename(filePath, customExtension);
}

function createDuplicateScriptCommand(): vscode.Disposable {
    const createDuplicateModuleScript = vscode.commands.registerCommand(
        "roblox.duplicateRobloxScript",
        async (uri: vscode.Uri) => {
            if (!uri || !uri.fsPath) {
                return;
            }
            const [valid, _] = validateParentDirectory(uri.fsPath)
            if (!valid) {
                return;
            }

            let dirPath = null;
            let isDir = false;
            try {
                dirPath = getDirectoryPath(uri.fsPath);
                isDir = isDirectory(uri.fsPath);
            } catch (err) {
                if (err instanceof Error) {
                    vscode.window.showErrorMessage(`Unable to create ModuleScript: ${err.message}`);
                } else {
                    vscode.window.showErrorMessage("Unable to create ModuleScript: Unknown error occurred.");
                }
                return;
            }

            if (!dirPath) {
                return;
            }

            let extensions = [
                ".client.lua",
                ".server.lua",
                ".lua"
            ];
            let fileExtensionToUse = null;
            for (let i = 0; i < extensions.length; i++) {
                const ext = extensions[i];
                if (uri.fsPath.includes(ext)) {
                    fileExtensionToUse = ext;
                    break;
                }
            }

            if (!fileExtensionToUse && !isDir) {
                vscode.window.showErrorMessage("Invalid file type chosen for duplication.");
                return;
            }

            let moduleName = getModuleName(uri);
            if (isDir) {
                moduleName = "Script";
                fileExtensionToUse = getFileExtensionForNewFile(uri.fsPath)
                if (!fileExtensionToUse) return
            }

            let filePath = path.join(dirPath, `${moduleName}${fileExtensionToUse}`);

            // Avoid overwriting existing files by adding "copy" suffix
            for (let i = 0; i < 20; i++) {
                filePath = path.join(dirPath, `${moduleName}${fileExtensionToUse}`);
                if (!fs.existsSync(filePath)) {
                    break;
                }
                moduleName = `${moduleName} copy${i}`;
            }

            if (fs.existsSync(filePath)) {
                vscode.window.showErrorMessage("Unable to create ModuleScript: File already exists.");
                return;
            }

            let fileContent = `local ModuleScript = {}\n\nreturn ModuleScript`; // Default content for new files
            if (!isDir) {
                try {
                    fileContent = fs.readFileSync(uri.fsPath, 'utf8');
                } catch (err) {
                    if (err instanceof Error) {
                        vscode.window.showErrorMessage(`Error reading original file: ${err.message}`);
                    } else {
                        vscode.window.showErrorMessage("Error reading original file: Unknown error occurred.");
                    }
                    return;
                }
            }

            try {
                fs.writeFileSync(filePath, fileContent);
            } catch (err) {
                if (err instanceof Error) {
                    vscode.window.showErrorMessage(`Unable to create ModuleScript: ${err.message}`);
                } else {
                    vscode.window.showErrorMessage("Unable to create ModuleScript: Unknown error occurred.");
                }
                return;
            }

            const openPath = vscode.Uri.file(filePath);
            vscode.workspace.openTextDocument(openPath).then((doc) => {
                vscode.window.showTextDocument(doc);
            });
        }
    );

    return createDuplicateModuleScript;
}

export function activate(context: vscode.ExtensionContext) {

    const definitionProvider = createGoToDefinitionProvider()
    const insertFunctionEnd = createAutoInsertFunctionEndCommand()
    const insertIfThenEnd = createAutoInsertIfThenCommand()
    const insertDo = createAutoInsertDoCommand()
    const insertUntil = createAutoInsertUntilCommand()
    const formatOnPaste = createFormatOnPasteCommand()
    const classAutoComplete = createClassAutoComplete()
    const insertScriptCommand = createDuplicateScriptCommand()
    const roactAutoComplete = createAutoCompleteRoact()

    // Cache clearing every 30 minutes
    const cacheClearInterval = setInterval(() => {
        definitionCache.clear();
        filePathToSymbols.clear();
        console.log("Roblox IDE: Cleared symbol definition cache.");
    }, 30 * 60 * 1000);

    context.subscriptions.push({ dispose: () => clearInterval(cacheClearInterval) });
    context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language: "luau" }, definitionProvider));
    context.subscriptions.push(insertFunctionEnd);
    context.subscriptions.push(insertIfThenEnd);
    context.subscriptions.push(insertDo);
    context.subscriptions.push(insertUntil);
    context.subscriptions.push(formatOnPaste)
    context.subscriptions.push(classAutoComplete)
    context.subscriptions.push(insertScriptCommand)
    context.subscriptions.push(roactAutoComplete)

    const config = vscode.workspace.getConfiguration();
    const isAutoInsertClassEnabled = config.get<boolean>("robloxIDE.autoInsertModuleBoilerplate.enabled", true);

    vscode.workspace.onDidChangeTextDocument(async (event) => {
        const changes = event.contentChanges;
        if (changes.length === 0) return;

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document) return;

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
            const currentLine = event.document.lineAt(position.line)
            const currentLineText = currentLine.text
            const pos = editor.selection.active;
            const beforeCursor = currentLineText.substring(0, pos.character);

            const matchesFunction = FUNCTION_REGEX.test(beforeCursor)
            const matchesFor = FOR_REGEX.test(beforeCursor)
            const matchesDo = DO_REGEX.test(beforeCursor)
            const matchesWhile = WHILE_REGEX.test(beforeCursor)
            const matchesIf = IF_REGEX.test(beforeCursor)
            const matchesThen = THEN_REGEX.test(beforeCursor)
            const matchesRepeat = REPEAT_REGEX.test(beforeCursor)
            const matchesElseIf = ELSEIF_REGEX_ALL.test(beforeCursor)
            const matchesElse = ELSE_REGEX.test(beforeCursor)
            const matchesClass = beforeCursor.match(CLASS_REGEX)
            const matchesRoactParser = roactParser.checkValidity(currentLineText)

            if (matchesRoactParser) {
                vscode.commands.executeCommand("roblox.autoCompleteRoact", matchesRoactParser)
            } else if (isAutoInsertClassEnabled && matchesClass && matchesClass[1]) {
                if (validateScopeClosureBeforeEdit(event.document)) return
                vscode.commands.executeCommand("roblox.autoCompleteClass", matchesClass);
            } else if (matchesFunction) {
                if (validateScopeClosureBeforeEdit(event.document)) return
                vscode.commands.executeCommand("roblox.autoInsertFunctionEnd");
            } else if (matchesFor || matchesWhile) {
                if (validateScopeClosureBeforeEdit(event.document)) return
                vscode.commands.executeCommand("roblox.autoInsertDo", matchesDo);
            } else if (matchesIf || matchesElseIf || matchesElse) {
                const areScopesClosedForDoc = validateScopeClosureBeforeEdit(event.document)
                if (areScopesClosedForDoc && !matchesElseIf) return
                vscode.commands.executeCommand("roblox.autoInsertIfThenEnd", matchesThen, matchesElse, matchesElseIf, areScopesClosedForDoc);
            } else if (matchesRepeat) {
                if (validateScopeClosureBeforeEdit(event.document)) return
                vscode.commands.executeCommand("roblox.autoInsertUntil");
            }
        }
    });
    console.log("Roblox IDE activated")
}