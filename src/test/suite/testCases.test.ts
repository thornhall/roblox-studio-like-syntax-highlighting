export interface TestCase {
    initial: string;
    expected: string;
    regex: RegExp;
}

// NOTE: Spaces and newlines matter in the `expected` strings

export const TEST_CASES: TestCase[] = [

//////////////////////
// WHILE LOOP TESTS //
//////////////////////
    {
        initial:
`while`,
        expected:
`while do
    
end`,
        regex: /while/
    },

////////////////////////
// IF STATEMENT TESTS //
////////////////////////
    {
        initial:
`if true then
    
else`,
        expected:
`if true then
    
else 

end`,
        regex: /else/
    },
    {
        initial:
`if`,
        expected:
`if then
    
end`,
        regex: /if/
    },

////////////////////
// FUNCTION TESTS //
////////////////////
    {
        initial:
`function`,
        expected:
`function()
    
end`,
        regex: /function/
    },
];