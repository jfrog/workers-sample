# JFrog Workers Samples

## JFrog Workers
JFrog Workers is a service in the JFrog Platform that provides a serverless execution environment.
You can create workers that react to events in the JFrog Platform similar to AWS Lambda services.
Workers service provides more flexibility to accomplish your use cases.
You can use these workers to perform certain tasks that extend the capabilities of the JFrog Platform according to your requirements.

See the full documentation [here](https://jfrog.com/help/r/jfrog-platform-administration-documentation/workers).

## Using the samples

This repository contains a collection of sample workers for common use cases. Feel free to use, modify, and extend these samples to accomplish your use cases. 

We have created these TypeScript samples based on [Artifactory User Plugin Samples](https://github.com/jfrog/artifactory-user-plugins).

Please submit a pull request if you have other valuable samples.

Each sample reside in its own directory that includes a _README.md_ with the instructions on how to use it.

You can also refer to the [documentation](https://jfrog.com/help/r/jfrog-platform-administration-documentation/workers) to discover how to setup and use workers.

Each worker sample is named following a convention `<workerKey>[.<triggerEvent>].ts`. No `triggerEvent` implies a `GENERIC_EVENT`.

## Contributing

Feel free to contribute new samples, and please create issues if you need our support. 


---

Copyright &copy; 2023-* JFrog Ltd.
