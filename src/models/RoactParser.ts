import Regex from './Regex'
import TreeItem from './TreeItem';
class RoactParser {
    prefix: string;
    tree: TreeItem[]

    constructor() {
        this.prefix = "Roact";
        this.tree = []
    }

    parse(input: string): void {
        this.clear();
        const tokens = this.getTreeArray(input);
        if (!tokens) return;
    
        // currentLayer represents the set of nodes that new "child" tokens will attach to.
        // At the start, top-level nodes (this.tree) are the current layer.
        let currentLayer: TreeItem[] = this.tree;
    
        // A stack to remember parent groups for sibling mode.
        // Each entry is the children array of a parent node.
        const parentStack: TreeItem[][] = [];
    
        // Default mode is 'child'
        let mode: 'child' | 'sibling' = 'child';
    
        for (const token of tokens) {
            if (token === '>') {
                mode = 'child';
                continue;
            }
            if (token === '+') {
                mode = 'sibling';
                continue;
            }
    
            // Parse the token into a TreeItem
            const baseItem = new TreeItem(token, 0);
            const clones: TreeItem[] = [];
            for (let i = 0; i < baseItem.multiplier; i++) {
                const clone = new TreeItem(token, i);
                clone.multiplier = 1; // Reset multiplier on clone
                clones.push(clone);
            }
    
            if (mode === 'child') {
                if (currentLayer.length === 0) {
                    // First token: add clones directly to the tree
                    this.tree.push(...clones);
                } else {
                    // Attach clones as children to every node in the current layer.
                    for (const parent of currentLayer) {
                        parent.children.push(...clones);
                    }
                }
                // Push the current layer on the stack, so sibling tokens can attach to it.
                parentStack.push(currentLayer);
                // The new current layer becomes the clones.
                currentLayer = clones;
            } else if (mode === 'sibling') {
                // Pop from parentStack so we move back up one level
                if (parentStack.length > 0) {
                    const parentGroup = parentStack[parentStack.length - 1];
            
                    for (const parent of parentGroup) {
                        parent.children.push(...clones);
                    }
            
                    // currentLayer is now the new clones
                    currentLayer = clones;
                } else {
                    // If stack is empty, treat as top-level sibling
                    this.tree.push(...clones);
                    currentLayer = clones;
                }
            }
        }
    }

    toSnippet(indentLevel = 0): string {
        return this.tree.map(t => t.toSnippet(indentLevel)).join("\n").trim();
    }

    private getTreeArray(input: string): string[] | undefined {
        const inner = this.extractBase(input);
        if (!inner) return;
    
        const tokens = inner
            .split(Regex.SEPARATORS())
            .map(token => token.trim())
            .filter(token => token.length > 0);
        return tokens;
    }

    private extractBase(input: string): string | null {
        const regex = Regex.BASE(this.prefix);
        const match = regex.exec(input.trim());
        return match ? match[1] : null;
    }

    checkValidity(input: string): string | null {
        const regex = Regex.BASE(this.prefix);
        const match = regex.exec(input.trim());
        return match ? match[0] : null;
    }

    clear(): void {
        this.tree = [];
    }
}

export default RoactParser