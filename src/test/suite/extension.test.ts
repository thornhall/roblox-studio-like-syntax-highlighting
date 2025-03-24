/*
    Run with `npm test` in a terminal.
*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { TEST_CASES } from './testCases.test';  // Import testCases from the new file

// Helper function to simulate typing and pressing Enter
async function typeAndPressEnter(editor: vscode.TextEditor, text: string, regex: RegExp) {
    const document = editor.document;
    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
    );

    // Replace the entire content of the document with the new text, trimming extra newlines
    await editor.edit((editBuilder) => {
        editBuilder.replace(fullRange, text.trim());
    });

    // Put cursor at beginning of line so it doesn't work even if our regex is wrong
    editor.selection = new vscode.Selection(0, 0, 0, 0);

    // Find the line that matches the regex
    let targetLine: vscode.TextLine | undefined;
    for (let line = 0; line < document.lineCount; line++) {
        const currentLine = document.lineAt(line);
        if (regex.test(currentLine.text)) {
            targetLine = currentLine;
            break;
        }
    }

    // If a matching line is found, move the cursor to the end of that line
    if (targetLine) {
        const endOfLine = targetLine.range.end;
        editor.selection = new vscode.Selection(endOfLine, endOfLine);
    } else {
        // Throw an error if no matching line is found
        throw new Error("regex match failed:\n" + text + '\n' + regex);
    }

    // await delay(1000); // Wait a second to view the changes

    // Simulate pressing Enter
    await vscode.commands.executeCommand('type', { text: '\n' });
}

// Helper function to introduce a delay in the test
async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const RUN_SINGLE_TEST_CASE: number = -1;  // Set to the index of the test case you want to run, or -1 for all tests

suite('Autocomplete Test Suite', function() {
    this.timeout(5000);

    let editor: vscode.TextEditor;

    suiteSetup(async () => {
        // Open a new untitled document in the editor
        const doc = await vscode.workspace.openTextDocument({ language: 'lua' });
        editor = await vscode.window.showTextDocument(doc);
    });

    suiteTeardown(() => {
        vscode.window.showInformationMessage('Tests done!');
    });

    const testCasesToRun = RUN_SINGLE_TEST_CASE === -1 ? TEST_CASES : [TEST_CASES[RUN_SINGLE_TEST_CASE]];    
    testCasesToRun.forEach((testCase, index) => {
        test(`Test Case ${(RUN_SINGLE_TEST_CASE === -1 ? index : RUN_SINGLE_TEST_CASE) + 1}`, async () => {
            // Clear the document before running the test
            await editor.edit((editBuilder) => {
                const start = editor.document.lineAt(0).range.start;
                const end = editor.document.lineAt(editor.document.lineCount - 1).range.end;
                editBuilder.delete(new vscode.Range(start, end));
            });

            // Step 1: Simulate typing the Lua code snippet from the test case
            await typeAndPressEnter(editor, testCase.initial, testCase.regex);

            await delay(200); // Need to wait for the extension to run the autocomplete
    
            // Step 2: Assert that the final text matches the expected text (ignoring whitespace)
            const finalText = editor.document.getText();
            assert.strictEqual(
                finalText.replace(/[\r]+/g, '').trim(),
                testCase.expected.replace(/[\r]+/g, '').trim()
            );
        });
    });
});