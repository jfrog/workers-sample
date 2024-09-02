# Before Create Token example

The worker enforces 3 checks before allowing tokens creation.

* The number of tokens owned by the subject should not exceeds a specific count.
* If it is a user token that is been created its expiry should not exceeds 1 month (the duration can be parameterized)
* If it is a service token that is been created its expiry should not exceeds 1 year (the duration can be parameterized)
