# Before Upload

This use case will look into the manifest for a **LABEL** named `org.jfrog.artifactory.projectKey`.

This **LABEL** should contains the target _projectKey_.

Then the worker will check if the target repository belongs to the matching project.

Meaning that the target repository should be prefixed by the _projectKey_.
