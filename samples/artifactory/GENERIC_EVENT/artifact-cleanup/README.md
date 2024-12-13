Artifact Cleanup Worker
========================

This worker code deletes all artifacts that have not been downloaded for the past *n time units*,
which is by default 1 month. It can be run manually from the REST API, using a worker generic event.

**Note:**

If you're trying to clean Docker images, this plugin may lead to unexpectedly partial or broken cleans. It is recommended to instead use the [cleanDockerImages](https://github.com/jfrog/workers-sample/tree/master/cleanup/cleanDockerImages) plugin for this purpose.

Expected JSON Payload
----------

- `timeUnit`: The unit of the time interval. *year*, *month*, *day*, *hour* or *minute* are allowed values. Default *month*.
- `timeInterval`: The time interval to look back before deleting an artifact. Default *1*.
- `repos`: A list of repositories to clean. This parameter is required.
- `dryRun`: If this parameter is passed, artifacts will not actually be deleted. Default *false*.
- `disablePropertiesSupport`: Disable the support of Artifactory Properties (see below *Artifactory Properties support* section). Default *false*.
- `limit`: The maximum number of artifacts to delete during the cleanup. Default *100*.
- `concurrency`: The number of artifacts to delete in parallel (can impact performances). Default *10*.

An example file could contain the following json:

```json
{
    "repos": [
        "libs-release-local"
    ],
    "timeUnit": "day",
    "timeInterval": 3,
    "dryRun": true,
    "disablePropertiesSupport": true,
    "limit": 100,
    "concurrency": 10
}
```

Artifactory Properties support
----------

Some Artifactory [Properties](https://www.jfrog.com/confluence/display/RTF/Properties) are supported if defined on *artifacts* or *folders*:

- `cleanup.skip`: Skip the artifact deletion if property defined on artifact's path ; artifact itself or in a parent folder(s).

Executing
---------

To execute the code as a worker generic event:

- Create a new generic worker with the given code (eg: my-worker)
- Example of execution using JFrog CLI

```bash
jf worker exec my-worker - <<EOF
{
    "repos": [
        "libs-release-local"
    ],
    "timeUnit": "day",
    "timeInterval": 3,
    "dryRun": true,
    "disablePropertiesSupport": true,
    "limit": 100,
    "concurrency": 10
}
EOF
```

- Example with the payload located into a file named `payload.json`:

```shell
jf worker exec my-worker @payload.json
```