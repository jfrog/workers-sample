Artifactory Remote Backup User Plugin
=====================================

This worker copies files from a remote cache to a local 'backup'
repository. This ensures that cached artifacts are still available, even after
they're removed from the cache. This worker can also be used to copy from a
local repository to a different local repository.

Note that this workers will not copy properties on folders, including Docker
image folders. Properties on artifacts are copied as expected.

Targets repositories should exist or the copies will fail.

Payload
-------

The worker expects a JSON object of repository pairs. For example, if you'd like to
backup `repo-foo-remote` to `repo-foo-backup-local`, and also backup
`repo-bar-remote` to `repo-bar-backup-local`, your configuration would be:

```json
{
    "backups": {
        "repo-foo-remote-cache": "repo-foo-backup-local",
        "repo-bar-remote-cache": "repo-bar-backup-local"
    },
    "dryRun": false
}
```


Usage
-----

The worker can be executed using as a Generic event.


```shell
curl -X POST -v -u admin:password "http://localhost:8080/worker/api/v1/execute/my-worker" --json @- <<EOF
{
    "backups": {
        "repo-foo-remote-cache": "repo-foo-backup-local",
        "repo-bar-remote-cache": "repo-bar-backup-local"
    },
    "dryRun": true
}
EOF
```
