# Block download if xray scan shows more than 2 critical security issues

This worker will block download if the Artifact has more than 2 critical security issues. If the artifact has not yet been scanned, the download will proceed with a warning. The accepted threshold may be changed by using the MAX_CRITICAL_SEC_ISSUES_ACCEPTED variable.
