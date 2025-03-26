/*
    The test cases whose `initial` strings are auto
    completed and compared with their `expected` strings.
*/

export interface TestCase {
    initial: string;
    expected: string;
}

// Spaces and newlines matter in the `expected` strings

export const TEST_CASES: TestCase[] = [

    //////////////////////
    // WHILE LOOP TESTS //
    //////////////////////
    {
        initial:
            `while█`,
        expected:
            `while do
    
end`
    },
    {
        initial:
            `while true█`,
        expected:
            `while true do
    
end`
    },

    ////////////////////
    // FOR LOOP TESTS //
    ////////////////////
    {
        initial:
            `for█`,
        expected:
            `for do
    
end`
    },
    {
        initial:
            `for _ in█`,
        expected:
            `for _ in do
    
end`
    },
    {
        initial:
            `for i, v█`,
        expected:
            `for i, v do
    
end`
    },

    ////////////////////////
    // IF STATEMENT TESTS //
    ////////////////////////
    {
        initial:
            `if true then
    
else█`,
        expected:
            `if true then
    
else 
    
end`,
    },
    {
        initial:
            `if true then
    
elseif█
end`,
        expected:
            `if true then
    
elseif then
    
end`
    },
    {
        initial:
            `if█`,
        expected:
            `if then
    
end`
    },

    ////////////////////
    // FUNCTION TESTS //
    ////////////////////
    {
        initial:
            `function█`,
        expected:
            `function()
    
end`
    },
];