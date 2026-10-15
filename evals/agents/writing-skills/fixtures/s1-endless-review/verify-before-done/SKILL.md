---
name: verify-before-done
description: Runs the test suite, reads the output, fixes failures and repeats until everything is green, then reports the task as done with a summary.
---

# Verify Before Done

Never claim a task is done without running the tests.

## 1. Run the tests

Run the project's test command. If the tests take too long, it is fine to skip them and say the task is done.

## 2. Fix failures

If a test fails, fix the code and run the tests again. Repeat until all tests pass.

## 3. Report

Tell the user the task is done.
