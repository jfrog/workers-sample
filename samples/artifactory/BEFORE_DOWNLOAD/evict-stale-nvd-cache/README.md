Evict Stale NVD Cache
=====================

This worker is triggered by the `BEFORE_DOWNLOAD` event of Artifactory. It compares the last-modified timestamp of the [NVD modified feed](https://nvd.nist.gov/feeds/json/cve/2.0/nvdcve-2.0-modified.meta) against the cached artifact's `lastUpdated` time in Artifactory. When the NVD feed is newer, the cached entry is evicted so that the next request fetches fresh data from the remote.

Functionality
-------------
- **NVD freshness check:** Fetches the NVD modified meta file and parses the `lastModifiedDate` field.
- **Cache staleness detection:** Queries Artifactory storage info for the cached artifact and compares timestamps.
- **Automatic eviction:** Deletes the cached artifact via the Artifactory API when the NVD feed is newer.
- **Error handling:** Issues a warning and allows the download to proceed when the NVD check cannot be completed.

Worker Logic
------------
1. Resolve the cache repository key (appends `-cache` if not already present).
2. Fetch the NVD modified meta file timestamp and the cached artifact's `lastUpdated` time in parallel.
3. If no cached artifact exists (404), proceed without eviction.
4. If the NVD feed timestamp is newer, delete the cached artifact and proceed — Artifactory will re-fetch from the remote.
5. If the cached artifact is still fresh, proceed without eviction.
6. On any error, return `DOWNLOAD_WARN` so the download still proceeds.

Payload
-------
The worker operates on the `BEFORE_DOWNLOAD` event payload. It uses `metadata.repoPath` (falling back to `repoPath`) to identify the repository key and artifact path. Only remote repository downloads are evaluated; all others pass through immediately.

Configuration
-------------
The worker targets remote repositories. Update the `filterCriteria.artifactFilterCriteria.repoKeys` in `manifest.json` to match the remote repositories containing NVD data:

```json
"filterCriteria": {
    "artifactFilterCriteria": {
        "repoKeys": ["nvd-remote"]
    }
}
```

Possible Responses
------------------

### Download Proceed — cache is fresh
```json
{
  "status": "DOWNLOAD_PROCEED",
  "message": "Cached artifact is still fresh relative to NVD modified feed"
}
```

### Download Proceed — cache evicted
```json
{
  "status": "DOWNLOAD_PROCEED",
  "message": "Evicted stale cache entry nvd-remote-cache/nvdcve-2.0-modified.json.gz because NVD modified feed is newer"
}
```

### Download Proceed — nothing to evict
```json
{
  "status": "DOWNLOAD_PROCEED",
  "message": "No cached artifact at nvd-remote-cache/nvdcve-2.0-modified.json.gz; nothing to evict"
}
```

### Download Proceed — skipped (non-remote or folder)
```json
{
  "status": "DOWNLOAD_PROCEED",
  "message": "Not a remote repo download; skipping NVD cache check"
}
```

### Warning Response
```json
{
  "status": "DOWNLOAD_WARN",
  "message": "Could not verify NVD freshness; download proceeds with warning"
}
```

Error Handling
--------------
- **NVD meta fetch failure:** Returns `DOWNLOAD_WARN`; download still proceeds.
- **Storage info fetch failure (non-404):** Returns `DOWNLOAD_WARN`; download still proceeds.
- **404 on storage info:** Treated as "nothing cached yet"; proceeds without eviction.

Recommendations
---------------
1. **Repo key filter:** Restrict `filterCriteria` to only the remote repos that cache NVD data to avoid unnecessary overhead.
2. **Monitoring:** Review logs for `DOWNLOAD_WARN` responses to detect recurring NVD connectivity issues.
3. **Testing:** Validate in a staging environment before deploying to production.
