## Fix flaky upload test

The upload test failed on our CI runner `build-07.corp.example` because the temp dir
was shared. See the internal ticket https://jira.acme-corp.internal/browse/BILL-2231.

Repro steps (run from my checkout):

    cd /Users/jdoe/src/acme-billing-private
    UPLOAD_KEY=sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c npm test

Thanks to jane.doe@acme-corp.com for the report. Logs: http://10.20.30.40:8080/logs/run-991
