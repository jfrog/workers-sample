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
`repo-bar-remote` to `repo-bar-backup-local`.
You can also specify `maxDepth` the maximum path depth to copy, as well as `maxFiles` the max number of item to copy.
Your configuration would be:

```json
{
    "backups": {
        "repo-foo-remote-cache": "repo-foo-backup-local",
        "repo-bar-remote-cache": "repo-bar-backup-local"
    },
    "dryRun": false,
    "maxDepth": 10,
    "maxFiles": 1000
}
```


Usage
-----

The worker can be executed using as a Generic event.

Execute with the payload from standard input:

```shell
jf worker exec my worker - <<EOF
{
    "backups": {
        "repo-foo-remote-cache": "repo-foo-backup-local",
        "repo-bar-remote-cache": "repo-bar-backup-local"
    },
    "dryRun": true
    "maxDepth": 10,
    "maxFiles": 1000
}
EOF
```
Execute with the payload located into a file name `payload.json`:

```shell
jf worker exec my-worker @payload.json
```