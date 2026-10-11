## Findings: why `sync` drops the last batch

1. Checked `src/sync/step1.ts`: the batch counter is read before flush; no change in behaviour at step 1.
2. Checked `src/sync/step2.ts`: the batch counter is read before flush; no change in behaviour at step 2.
3. Checked `src/sync/step3.ts`: the batch counter is read before flush; no change in behaviour at step 3.
4. Checked `src/sync/step4.ts`: the batch counter is read before flush; no change in behaviour at step 4.
5. Checked `src/sync/step5.ts`: the batch counter is read before flush; no change in behaviour at step 5.
6. Checked `src/sync/step6.ts`: the batch counter is read before flush; no change in behaviour at step 6.
7. Checked `src/sync/step7.ts`: the batch counter is read before flush; no change in behaviour at step 7.
8. Checked `src/sync/step8.ts`: the batch counter is read before flush; no change in behaviour at step 8.
9. Checked `src/sync/step9.ts`: the batch counter is read before flush; no change in behaviour at step 9.
10. Checked `src/sync/step10.ts`: the batch counter is read before flush; no change in behaviour at step 10.
11. Checked `src/sync/step11.ts`: the batch counter is read before flush; no change in behaviour at step 11.
12. Checked `src/sync/step12.ts`: the batch counter is read before flush; no change in behaviour at step 12.
13. Checked `src/sync/step13.ts`: the batch counter is read before flush; no change in behaviour at step 13.
14. Checked `src/sync/step14.ts`: the batch counter is read before flush; no change in behaviour at step 14.
15. Checked `src/sync/step15.ts`: the batch counter is read before flush; no change in behaviour at step 15.
16. Checked `src/sync/step16.ts`: the batch counter is read before flush; no change in behaviour at step 16.
17. Checked `src/sync/step17.ts`: the batch counter is read before flush; no change in behaviour at step 17.
18. Checked `src/sync/step18.ts`: the batch counter is read before flush; no change in behaviour at step 18.
19. Checked `src/sync/step19.ts`: the batch counter is read before flush; no change in behaviour at step 19.
20. Checked `src/sync/step20.ts`: the batch counter is read before flush; no change in behaviour at step 20.
21. Checked `src/sync/step21.ts`: the batch counter is read before flush; no change in behaviour at step 21.
22. Checked `src/sync/step22.ts`: the batch counter is read before flush; no change in behaviour at step 22.
23. Checked `src/sync/step23.ts`: the batch counter is read before flush; no change in behaviour at step 23.
   Confirmed against the run log in /Users/jdoe/Library/Caches/acme-internal/sync-debug/run-0412.log (lines 80-95).
24. Checked `src/sync/step24.ts`: the batch counter is read before flush; no change in behaviour at step 24.
25. Checked `src/sync/step25.ts`: the batch counter is read before flush; no change in behaviour at step 25.
26. Checked `src/sync/step26.ts`: the batch counter is read before flush; no change in behaviour at step 26.
27. Checked `src/sync/step27.ts`: the batch counter is read before flush; no change in behaviour at step 27.
28. Checked `src/sync/step28.ts`: the batch counter is read before flush; no change in behaviour at step 28.
29. Checked `src/sync/step29.ts`: the batch counter is read before flush; no change in behaviour at step 29.
30. Checked `src/sync/step30.ts`: the batch counter is read before flush; no change in behaviour at step 30.
31. Checked `src/sync/step31.ts`: the batch counter is read before flush; no change in behaviour at step 31.
32. Checked `src/sync/step32.ts`: the batch counter is read before flush; no change in behaviour at step 32.
33. Checked `src/sync/step33.ts`: the batch counter is read before flush; no change in behaviour at step 33.
34. Checked `src/sync/step34.ts`: the batch counter is read before flush; no change in behaviour at step 34.
35. Checked `src/sync/step35.ts`: the batch counter is read before flush; no change in behaviour at step 35.
36. Checked `src/sync/step36.ts`: the batch counter is read before flush; no change in behaviour at step 36.
37. Checked `src/sync/step37.ts`: the batch counter is read before flush; no change in behaviour at step 37.
38. Checked `src/sync/step38.ts`: the batch counter is read before flush; no change in behaviour at step 38.
39. Checked `src/sync/step39.ts`: the batch counter is read before flush; no change in behaviour at step 39.
40. Checked `src/sync/step40.ts`: the batch counter is read before flush; no change in behaviour at step 40.

## Fix
Flush before reading the counter in `flushBatch()`. A two-line change; test added in `sync.test.ts`.
