# Copy the .deb and .rpm file to specific repository

This worker will copy .deb and .rpm files from given repository set to specified repository.

NOTE: Don't forget to add source repositories in the worker's filters.

Also you should add following exclude patterns: repodata/** _tmp_/** and dists/**.

