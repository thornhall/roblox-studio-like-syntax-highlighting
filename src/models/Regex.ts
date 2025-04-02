
const CHARSETS: {
    ROACT_ITEM?: string,
    PROP_VALUE_SAFE?: string,
    VALID_SEPARATORS?: string
    VALID_CHARACTERS?: string
    VALID_INCREMENTORS?: string
} = {};
CHARSETS.ROACT_ITEM = "A-Za-z0-9";
CHARSETS.VALID_SEPARATORS = '>+';
CHARSETS.VALID_INCREMENTORS = '\\$';
CHARSETS.VALID_CHARACTERS = `\\s\\[\\]=",#._\\-\\(\\)\\?!\\*\\{\\}${CHARSETS.VALID_INCREMENTORS}`;
CHARSETS.PROP_VALUE_SAFE = `[${CHARSETS.VALID_SEPARATORS}${CHARSETS.ROACT_ITEM}${CHARSETS.VALID_CHARACTERS}]`;

const patterns: {
    BASE: (snippet: string, flag?: string) => RegExp;
    SEPARATORS: (flag?: string) => RegExp;
    PROPS: (flag?: string) => RegExp;
    MULT: (flag?: string) => RegExp;
    TEXT: (flag?: string) => RegExp;
    INCREMENTOR: (flag?: string) => RegExp;
} = {} as any;

function basePattern(snippet: string, flag = "g"): RegExp {
    return new RegExp(`${snippet}\\[(${CHARSETS.PROP_VALUE_SAFE}+)\\]$`, flag);
}

function separatorPattern(flag = "g"): RegExp {
    return new RegExp(`(\\s*[${CHARSETS.VALID_SEPARATORS}]\\s*)`, flag);
}

function propsPattern(flag = "g"): RegExp {
    return new RegExp(`^([${CHARSETS.ROACT_ITEM}_]+)(?:\\[(.*)\\])?$`, flag);
}

function multiplierPattern(flag = ""): RegExp {
    return new RegExp(`\\s*\\*\\s*(\\d+)(?=\\[|\\s|$)`, flag);
}

function textPattern(flag = ""): RegExp {
    return new RegExp(`{([^}]*)\}`, flag);
}

function incrementorPattern(flag = ""): RegExp {
    return new RegExp(`${CHARSETS.VALID_INCREMENTORS}`, flag);
}

patterns.BASE = basePattern;
patterns.SEPARATORS = separatorPattern;
patterns.PROPS = propsPattern;
patterns.MULT = multiplierPattern;
patterns.TEXT = textPattern;
patterns.INCREMENTOR = incrementorPattern;

export default patterns;
