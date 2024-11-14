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
jf worker exec my-worker - <<EOF
{
    "path": ["example-docker-local/dir1", "example-docker-local/dir2"]
}
EOF
```

Execute with the payload located into a file named `payload.json`:

```shell
jf worker exec my-worker @payload.json
```