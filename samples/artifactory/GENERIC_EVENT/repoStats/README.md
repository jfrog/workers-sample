Artifactory Repo Stats Worker
==============================

This Worker displays certain statistics about requested files.
Given one or more repo name, this worker will show the number of artifacts and
the combined filesize of those artifacts at each of the repos.

Payload
-------

The worker expects a JSON object of repo keys as a comma separated string. For example, if you'd like to
get repo stat of  `example-repo` and also `local-repo`, your payload would be:

```json
{
    "paths": "example-repo,local-repo",
}
```


Usage
-----

The worker can be executed using as a Generic event.


```shell
curl -X POST "http://<JPD_SERVERNAME>/worker/api/v1/execute/RepoStats" --header 'Content-Type: application/json' --header 'Authorization: Bearer <Token>' --data '{ "paths": "example-repo-local"}'
EOF
```
sample response:
```json
{
  "data": {
    "message": "Path exists: example-repo-local",
    "stats": [
      {
        "repoPath": "example-repo-local",
        "count": 3,
        "usedSpaceInBytes": 5131510,
        "usedSpace": "4.89 MB"
      }
    ]
  },
  "executionStatus": "STATUS_SUCCESS"
}
```
