export default class PropItem {
    name: string;
    value: string;

    constructor(name: string, value: string) {
        this.name = name;
        this.value = value;
    }

    toSnippet(): string {
        return `${this.name}: ${this.value}`;
    }
}
