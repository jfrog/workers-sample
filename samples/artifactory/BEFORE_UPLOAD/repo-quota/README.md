Artifactory Storage Quota
=========================

This worker is used to limit storage under a repository path.

Features
--------

- Ability for an administrator to set property named `repository.path.quota` on any existing repository
path to the number of bytes to limit for artifacts stored under the repository path. Once the limit is
met all future put requests to store artifacts under the repository path are rejected.

### Execution ###
This plugin is a storage beforeUpload execution.
