import assert from "node:assert/strict";
import { executeCsharp } from "../runCsharp.js";

const hello = `using System;

class Program
{
    static void Main()
    {
        Console.WriteLine("hello-csharp-run");
    }
}
`;

const { output, error } = executeCsharp(hello);
if (/dotnet not found/i.test(error)) {
  console.log("test-run-csharp: skipped (dotnet not on PATH)");
  process.exit(0);
}

assert.match(output, /hello-csharp-run/);
assert.equal(error.trim(), "");

console.log("test-run-csharp: ok");
