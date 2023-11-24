# Delete Artifacts By Property Value

This worker is used to delete artifacts with a specific property with a value less than the value specified in the execution command.

Payload
-------

- `properties`: A JSON object listing the properties to check. Each key should match a property name, and the value the threshold (number) to check.
- `repos`: The list of repositories from which you want to delete artifacts with this property
- `dryRun`: If set to *true* the artifacts to delete will be logged but not deleted. The parameter is optional. Default: *false*.

Execution
---------


```shell
curl -X POST -v -u admin:password "http://localhost:8080/worker/api/v1/execute/my-worker" --json @- <<EOF
{
    "repos": [ "example-repo-local" ],
    "properties": {
        "property1": 15,
        "property2": 17
    },
    "dryRun": true
}
EOF
```
