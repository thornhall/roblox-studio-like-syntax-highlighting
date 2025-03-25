/*
    Run with `npm test` in a terminal.
*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { TEST_CASES } from './testCases.test';
import { LARGE_SCRIPT_SRC } from './largeScript.test';

// Helper function to simulate typing and pressing Enter
async function typeAndPressEnter(editor: vscode.TextEditor, initialText: string) {
    const document = editor.document;
    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
    );

    // Replace the entire content of the document with the new text, trimming extra newlines
    await editor.edit((editBuilder) => {
        editBuilder.replace(fullRange, initialText.trim());
    });

    // Find the position of the block character (█)
    const blockIndex = initialText.indexOf('█');
    if (blockIndex === -1) {
        throw new Error(`No block character "█" found in initial text:` + '\n' + initialText);
    }

    // Convert block index to line and character position
    let charCount = 0;
    let blockPosition: vscode.Position | null = null;
    for (let line = 0; line < document.lineCount; line++) {
        const lineText = document.lineAt(line).text;
        if (charCount + lineText.length >= blockIndex) {
            blockPosition = new vscode.Position(line, blockIndex - charCount);
            break;
        }
        charCount += lineText.length + 1; // +1 accounts for the newline character
    }

    if (!blockPosition) {
        throw new Error("Failed to determine block character position.");
    }

    // Set cursor at the found position
    editor.selection = new vscode.Selection(blockPosition, blockPosition);

    // Delete the block character
    await editor.edit((editBuilder) => {
        const blockRange = new vscode.Range(blockPosition, blockPosition.translate(0, 1));
        editBuilder.delete(blockRange);
    });

    if (TEST_DELAY_MS > 0) {
        await delay(TEST_DELAY_MS); // Wait a bit to view the changes
    }

    // Simulate pressing Enter
    await vscode.commands.executeCommand('type', { text: '\n' });
}

// Helper function to introduce a delay in the test
async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const RUN_SINGLE_TEST_CASE: number = -1;  // Set to the index of the test case you want to run, or -1 for all tests
const APPEND_LARGE_SCRIPT = false // Use this once all of your test cases work as standalones
const TEST_DELAY_MS = 1000 // The time to wait after inserting the `initial` string and before pressing enter. Set to -1 if not using.

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
        test(`Test Case ${RUN_SINGLE_TEST_CASE === -1 ? index + 1: RUN_SINGLE_TEST_CASE}`, async () => {
            // Clear the document before running the test
            await editor.edit((editBuilder) => {
                const start = editor.document.lineAt(0).range.start;
                const end = editor.document.lineAt(editor.document.lineCount - 1).range.end;
                editBuilder.delete(new vscode.Range(start, end));
            });

            // Step 1: Simulate typing the Lua code snippet from the test case
            await typeAndPressEnter(editor, testCase.initial + '\n' + (APPEND_LARGE_SCRIPT ? LARGE_SCRIPT_SRC : ""));

            await delay(300); // Need to wait for the extension to run the autocomplete
    
            // Step 2: Assert that the final text matches the expected text (ignoring whitespace)
            const finalText = editor.document.getText();
            assert.strictEqual(
                finalText.replace(/[\r]+/g, '').trim(),
                (testCase.expected + '\n' + (APPEND_LARGE_SCRIPT ? LARGE_SCRIPT_SRC : "")).replace(/[\r]+/g, '').trim()
            );
        });
    });
});