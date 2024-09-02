Artifactory Delete Empty Dirs User Plugin
=========================================

This worker deletes all empty directories found inside any of a given set of
paths.

Parameters
----------

This worker takes one parameter, called `paths`, which consists of a
comma-separated list of paths to search for empty directories in. Each path is
in the form `repository-name/path/to/dir`.

Executing
---------

To execute the worker:


```shell
curl -X POST -v -u admin:password "http://localhost:8080/worker/api/v1/execute/my-worker" --json @- <<EOF
{
    "path": ["example-docker-local/dir1", "example-docker-local/dir2"]
}
EOF
```
