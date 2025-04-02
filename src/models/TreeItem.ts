import PropItem from "./PropItem"
import patterns from "./Regex"

export default class TreeItem {
    value: string
    component: string 
    props: PropItem[]
    children: TreeItem[]
    multiplier: number
    index: number

    constructor(value: string, index: number) {
        this.value = value
        this.component = ""
        this.props = []
        this.children = []
        this.multiplier = 1
        this.index = index
        this.parseComponent(value)
    }

    private parseComponent(raw: string): void {
        raw = this.parseMultiplier(raw)
        raw = this.parseText(raw, this.index)
        const [component, propsBlock] = this.extractComponentAndProps(raw)

        this.component = component

        if (propsBlock) {
            const entries = this.splitPropEntries(propsBlock)
            this.parseProps(entries)
        }
    }

    private parseText(raw: string, index: number): string {
        const curlyMatch = raw.match(patterns.TEXT());
        if (curlyMatch) {
            let textValue = curlyMatch[1].trim();
            textValue = textValue.replace(patterns.INCREMENTOR(), index.toString());
            this.props.push(new PropItem("Text", `"${textValue}"`));
            raw = raw.replace(patterns.TEXT(), '');
        }
        return raw;
    }

    private parseMultiplier(raw: string): string {
        const match = raw.match(patterns.MULT())
        if (match) {
            this.multiplier = parseInt(match[1], 10)
            return raw.replace(patterns.MULT(), '')
        }
        return raw
    }

    private extractComponentAndProps(raw: string): [string, string | null] {
        const bracketIndex = raw.indexOf('[')
        if (bracketIndex === -1) {
            return [raw.trim(), null]
        }

        const component = raw.slice(0, bracketIndex).trim()
        const props = raw.slice(bracketIndex + 1, -1).trim() // remove [ and final ]
        return [component, props]
    }

    private splitPropEntries(inner: string): string[] {
        const entries: string[] = []
        let buffer = ''
        let depth = 0
        let insideString = false

        for (let i = 0; i < inner.length; i++) {
            const char = inner[i]

            if (char === '"' || char === "'") {
                insideString = !insideString
            } else if (!insideString) {
                if (char === '(') depth++
                if (char === ')') depth--
                if (char === ',' && depth === 0) {
                    entries.push(buffer.trim())
                    buffer = ''
                    continue
                }
            }

            buffer += char
        }

        if (buffer.trim()) {
            entries.push(buffer.trim())
        }

        return entries
    }

    private parseProps(entries: string[]): void {
        for (const entry of entries) {
            const eqIndex = entry.indexOf('=')
            if (eqIndex === -1) continue

            const key = entry.slice(0, eqIndex).trim()
            const value = entry.slice(eqIndex + 1).trim()
            this.props.push(new PropItem(key, value))
        }
    }

    toSnippet(indentLevel = 0): string {
        const indent = "    ".repeat(indentLevel)

        const propsObject = this.props.length > 0
            ? `{ ${this.props.map(p => p.toSnippet()).join(", ")} }`
            : "{}"

        if (this.children.length === 0) {
            return `${indent}Roact.createElement("${this.component}", ${propsObject}, {})`
        }

        const childSnippets = this.children
            .map(child => child.toSnippet(indentLevel + 1))
            .join(",\n")

        return `${indent}Roact.createElement("${this.component}", ${propsObject}, {\n${childSnippets}\n${indent}})`
    }
}
